"""Real UFACTORY xArm controller adapter built on ``xarm-python-sdk``.

Safety invariants:
- Default mode is simulation; this controller is only activated by explicit ``real.connect``.
- ``xarm.wrapper`` is imported lazily with stdout redirected to stderr so SDK banner prints
  never corrupt the sidecar's stdout handshake line.
- On connect, controller ``(axis, device_type)`` is verified against supported models before
  any command is sent; mismatched or unrecognized controllers are refused and disconnected.
- Controller errors/warnings are never cleared automatically. Motion requires explicit
  ``enable(True)`` and healthy controller state (``error_code == 0``).
- Configuration parameters (TCP offset/payload, world offset, collision sensitivity, mounting,
  initial point) are strictly read-only from the controller: UFClient reads them from the
  hardware to sync local state and never writes configuration parameters back to the arm.
- Continuous velocity jogs (Mode 4 / Mode 5) send ``duration=0`` once on start or velocity
  change (avoiding firmware segment pauses on repeated finite-duration commands), while
  periodic heartbeats refresh a sidecar watchdog timer and check safety boundaries;
  ``stop()`` bypasses the command lock for minimal latency.
"""

from __future__ import annotations

import contextlib
import math
import numbers
import sys
import threading
import time
import warnings
from collections.abc import Callable
from typing import Any

from .. import units
from ..errors import (
    REAL_CONNECT_FAILED,
    REAL_CONTROLLER_ERROR,
    REAL_MODEL_MISMATCH,
    REAL_MOTION_REJECTED,
    REAL_NOT_CONNECTED,
    REAL_SDK_UNAVAILABLE,
    RpcError,
    invalid_params,
)
from . import factory
from .kin_pinocchio import LINEAR_AXES, ROT_AXES, jog_target, pose_si_to_se3, se3_to_pose_si

DEFAULT_REAL_IP = "192.168.1.60"

#: Controller (axis, device_type) -> UFClient robot key (firmware v2.x convention).
CONTROLLER_MODEL_MAP: dict[tuple[int, int], str] = {
    (5, 5): "xarm5_1305",
    (6, 6): "xarm6_1305",
    (7, 7): "xarm7_1305",
    (6, 9): "lite6",
    (6, 12): "uf850",
}

MODE_POSITION = 0
MODE_JOINT_VELOCITY = 4
MODE_CARTESIAN_VELOCITY = 5

STATE_MOTION = 0
STATE_MOVING = 1
STATE_READY = 2
STATE_PAUSE = 3
STATE_STOP = 4
STATE_DECEL_STOP = 6

DEFAULT_JOINT_ACC_DPS2 = 200.0
DEFAULT_TCP_ACC_MMS2 = 1000.0
DEFAULT_VEL_DURATION_S = 0.4
VEL_LOOKAHEAD_S = 0.15
WATCHDOG_MARGIN_S = 0.12
BOUNDARY_EPS = 1e-6

#: SDK control limits per supported real gripper adapter.
GRIPPER_LIMITS: dict[str, dict[str, tuple[int, int]]] = {
    "robotiq_2f_85": {"pos": (0, 255), "speed": (0, 255), "force": (0, 255)},
    "robotiq_2f_140": {"pos": (0, 255), "speed": (0, 255), "force": (0, 255)},
    "gripper_g2": {"pos": (0, 84), "speed": (15, 225), "force": (1, 100)},
    "bio_gripper_g2": {"pos": (71, 150), "speed": (500, 4000), "force": (1, 100)},
}


def _sdk_code(res: Any) -> int:
    return int(res[0]) if isinstance(res, (tuple, list)) else int(res)


def _clamp_int(val: float, bounds: tuple[int, int]) -> int:
    return int(max(bounds[0], min(bounds[1], round(float(val)))))


def _positive_int(obj: Any, attr: str) -> int | None:
    val = getattr(obj, attr, None)
    if isinstance(val, numbers.Integral) and not isinstance(val, bool) and int(val) > 0:
        return int(val)
    return None


def _default_arm_factory(ip: str) -> Any:
    with contextlib.redirect_stdout(sys.stderr):
        try:
            from xarm.wrapper import XArmAPI
        except ImportError as exc:
            raise RpcError(REAL_SDK_UNAVAILABLE, f"xarm-python-sdk is not installed: {exc}") from None
        return XArmAPI(ip, is_radian=False, do_not_open=False)


def _float_list(raw: Any, n: int, default: float = 0.0) -> list[float]:
    if raw is None:
        return [default] * n
    try:
        vals = [float(x) for x in list(raw)[:n]]
    except (TypeError, ValueError):
        return [default] * n
    if len(vals) < n:
        vals.extend([default] * (n - len(vals)))
    return [v if math.isfinite(v) else default for v in vals]


def _parse_payload(raw: Any) -> dict[str, Any]:
    """Parse XArmAPI ``tcp_load`` (either ``[mass, [cx, cy, cz]]`` or ``[mass, cx, cy, cz]``)."""
    if not isinstance(raw, (list, tuple)) or len(raw) < 2:
        return {"mass_kg": 0.0, "com_mm": [0.0, 0.0, 0.0]}
    try:
        mass = float(raw[0])
        if not math.isfinite(mass) or mass < 0:
            mass = 0.0
    except (TypeError, ValueError):
        mass = 0.0
    if isinstance(raw[1], (list, tuple)):
        com = _float_list(raw[1], 3)
    else:
        com = _float_list(raw[1:4], 3)
    return {"mass_kg": mass, "com_mm": com}


def _parse_collision_sensitivity(raw: Any) -> int | None:
    if isinstance(raw, numbers.Integral) and not isinstance(raw, bool):
        return max(0, min(5, int(raw)))
    if isinstance(raw, (int, float)) and not isinstance(raw, bool) and math.isfinite(raw):
        return max(0, min(5, int(round(raw))))
    return None


def _parse_gravity(raw: Any) -> list[float]:
    gx, gy, gz = _float_list(raw, 3)
    if math.sqrt(gx * gx + gy * gy + gz * gz) < 1e-6:
        return [0.0, 0.0, -1.0]
    return [gx, gy, gz]


def gravity_to_mount_deg(gravity: list[float]) -> list[float]:
    """Invert XArm ``set_mount_direction`` gravity vector into ``[tilt_deg, rotate_deg]``."""
    gx, gy, gz = _float_list(gravity, 3)
    norm = math.sqrt(gx * gx + gy * gy + gz * gz)
    if norm < 1e-6:
        return [0.0, 0.0]
    nx, ny, nz = gx / norm, gy / norm, gz / norm
    tilt = math.degrees(math.acos(max(-1.0, min(1.0, -nz))))
    if abs(math.sin(math.radians(tilt))) > 1e-4:
        rot = math.degrees(math.atan2(-ny, nx))
        if abs(rot + 180.0) < 1e-6:
            rot = 180.0
        if abs(rot) < 1e-9:
            rot = 0.0
    else:
        rot = 0.0
    if abs(tilt) < 1e-9:
        tilt = 0.0
    return [round(tilt, 3), round(rot, 3)]


def _check_boundary(
    boundary: dict[str, Any] | None,
    model_limits: list[tuple[float, float]],
    cur_q: list[float],
    next_q: list[float] | None = None,
    cur_tcp: list[float] | None = None,
    next_tcp: list[float] | None = None,
) -> dict[str, Any] | None:
    """Block moves that leave or move further outside joint limits or user safety boundary."""
    dof = len(model_limits)
    j_min = [lo for lo, _ in model_limits]
    j_max = [hi for _, hi in model_limits]
    tcp_min: list[float | None] = [None, None, None]
    tcp_max: list[float | None] = [None, None, None]

    if boundary:
        b_jmin = boundary.get("joint_min")
        b_jmax = boundary.get("joint_max")
        if isinstance(b_jmin, (list, tuple)):
            for i in range(min(dof, len(b_jmin))):
                if b_jmin[i] is not None:
                    j_min[i] = max(j_min[i], float(b_jmin[i]))
        if isinstance(b_jmax, (list, tuple)):
            for i in range(min(dof, len(b_jmax))):
                if b_jmax[i] is not None:
                    j_max[i] = min(j_max[i], float(b_jmax[i]))
        b_tmin = boundary.get("tcp_min")
        b_tmax = boundary.get("tcp_max")
        if isinstance(b_tmin, (list, tuple)):
            for i in range(min(3, len(b_tmin))):
                tcp_min[i] = None if b_tmin[i] is None else float(b_tmin[i])
        if isinstance(b_tmax, (list, tuple)):
            for i in range(min(3, len(b_tmax))):
                tcp_max[i] = None if b_tmax[i] is None else float(b_tmax[i])

    if next_q is not None:
        for i in range(min(dof, len(next_q), len(cur_q))):
            lo, hi = j_min[i], j_max[i]
            if next_q[i] < lo - BOUNDARY_EPS and next_q[i] < cur_q[i] - BOUNDARY_EPS:
                return {"kind": "joint", "index": i, "side": "min", "limit": lo}
            if next_q[i] > hi + BOUNDARY_EPS and next_q[i] > cur_q[i] + BOUNDARY_EPS:
                return {"kind": "joint", "index": i, "side": "max", "limit": hi}

    if next_tcp is not None and cur_tcp is not None:
        for i in range(3):
            lo, hi = tcp_min[i], tcp_max[i]
            if lo is not None and next_tcp[i] < lo - BOUNDARY_EPS and next_tcp[i] < cur_tcp[i] - BOUNDARY_EPS:
                return {"kind": "tcp", "axis": i, "side": "min", "limit": lo}
            if hi is not None and next_tcp[i] > hi + BOUNDARY_EPS and next_tcp[i] > cur_tcp[i] + BOUNDARY_EPS:
                return {"kind": "tcp", "axis": i, "side": "max", "limit": hi}

    return None


def _boundary_error(v: dict[str, Any]) -> RpcError:
    if v["kind"] == "joint":
        axis = f"J{v['index'] + 1}"
        unit = "deg"
    else:
        axis = f"TCP {('X', 'Y', 'Z')[v['axis']]}"
        unit = "mm"
    return RpcError(
        REAL_MOTION_REJECTED,
        f"{axis} reached safety boundary ({v['side']} {v['limit']:.1f} {unit})",
        {"boundary": v},
    )


class RealXArmController:
    """Thread-safe controller wrapper for one active physical UFACTORY arm."""

    def __init__(
        self,
        arm_factory: Callable[[str], Any] | None = None,
        *,
        connect_wait_s: float = 1.0,
        mode_wait_s: float = 0.3,
    ) -> None:
        self._arm_factory = arm_factory or _default_arm_factory
        self._connect_wait_s = connect_wait_s
        self._mode_wait_s = mode_wait_s
        self._cmd_lock = threading.RLock()
        self._wd_lock = threading.Lock()
        self._arm: Any = None
        self._ip: str = ""
        self._robot_key: str = ""
        self._dof: int = 0
        self._limits_deg: list[tuple[float, float]] = []
        self._enabled: bool = False
        self._enable_grace_until: float = 0.0
        self._watchdog: threading.Timer | None = None
        self._active_vel_mode: int | None = None
        self._active_vel: list[float] | None = None
        self._vel_started_at: float = 0.0
        self._stop_seq: int = 0
        self._studio_mount_deg: list[float] | None = None
        self._studio_initial_point: list[float] | None = None

    @property
    def is_connected(self) -> bool:
        arm = self._arm
        return arm is not None and bool(getattr(arm, "connected", False))

    # -- Watchdog & active velocity stream state -----------------------------
    def _clear_active_vel(self) -> None:
        self._active_vel_mode = None
        self._active_vel = None
        self._vel_started_at = 0.0

    def _cancel_watchdog(self) -> None:
        with self._wd_lock:
            if self._watchdog is not None:
                self._watchdog.cancel()
                self._watchdog = None

    def _arm_watchdog(self, timeout_s: float) -> None:
        with self._wd_lock:
            if self._watchdog is not None:
                self._watchdog.cancel()
            t = threading.Timer(timeout_s, self._on_watchdog_timeout)
            t.daemon = True
            self._watchdog = t
            t.start()

    def _on_watchdog_timeout(self) -> None:
        with self._wd_lock:
            self._watchdog = None
        self._stop_seq += 1
        self._clear_active_vel()
        arm = self._arm
        if arm is not None:
            with contextlib.suppress(Exception):
                arm.set_state(STATE_STOP)

    # -- Connection lifecycle ------------------------------------------------
    def connect(self, ip: str, expected_robot: str | None = None) -> dict[str, Any]:
        ip = ip.strip()
        if not ip or any(c.isspace() for c in ip):
            raise RpcError(REAL_CONNECT_FAILED, "invalid robot IP address")

        with self._cmd_lock:
            if self._arm is not None:
                self.disconnect()

            try:
                with contextlib.redirect_stdout(sys.stderr):
                    arm = self._arm_factory(ip)
            except RpcError:
                raise
            except Exception as exc:
                raise RpcError(REAL_CONNECT_FAILED, f"failed to connect to {ip}: {exc}") from None

            deadline = time.monotonic() + self._connect_wait_s
            while time.monotonic() < deadline:
                if getattr(arm, "connected", False) and _positive_int(arm, "axis") is not None:
                    mtable = getattr(arm, "motor_enable_states", None)
                    axis_n = _positive_int(arm, "axis") or 6
                    if not isinstance(mtable, (list, tuple)) or all(v in (0, 1) for v in mtable[:axis_n]):
                        break
                time.sleep(0.05)

            if not getattr(arm, "connected", False):
                with contextlib.suppress(Exception):
                    arm.disconnect()
                raise RpcError(REAL_CONNECT_FAILED, f"failed to connect to controller at {ip}")

            axis = _positive_int(arm, "axis")
            device_type = _positive_int(arm, "device_type")
            detected = CONTROLLER_MODEL_MAP.get((axis or 0, device_type or 0))
            if detected is None:
                with contextlib.suppress(Exception):
                    arm.disconnect()
                raise RpcError(
                    REAL_MODEL_MISMATCH,
                    f"unsupported controller model (axis={axis}, device_type={device_type})",
                    {"axis": axis, "device_type": device_type},
                )
            if expected_robot and expected_robot != detected:
                with contextlib.suppress(Exception):
                    arm.disconnect()
                raise RpcError(
                    REAL_MODEL_MISMATCH,
                    (
                        f"controller reports {detected} (axis={axis}, device_type={device_type}), "
                        f"expected {expected_robot}"
                    ),
                    {"detected": detected, "expected": expected_robot},
                )

            info = factory.catalog().info(detected)
            backends = factory.create(info)
            lo = units.rad_to_deg(backends.kin.lower)
            hi = units.rad_to_deg(backends.kin.upper)

            self._arm = arm
            self._ip = ip
            self._robot_key = detected
            self._dof = info.dof
            self._limits_deg = [(float(a), float(b)) for a, b in zip(lo, hi)]
            # Detect actual hardware motor enable state instead of forcing duplicate enable.
            error_code = int(getattr(arm, "error_code", 0) or 0)
            hw_en = self._read_hw_enabled(arm)
            self._enabled = bool(hw_en is True and error_code == 0)
            self._enable_grace_until = 0.0
            self._studio_mount_deg = None
            self._studio_initial_point = None
            self._clear_active_vel()
            return self.snapshot()

    def disconnect(self) -> dict[str, Any]:
        self._stop_seq += 1
        self._cancel_watchdog()
        self._clear_active_vel()
        with self._cmd_lock:
            arm = self._arm
            self._arm = None
            self._enabled = False
            self._ip = ""
            self._robot_key = ""
            self._dof = 0
            self._limits_deg = []
            self._studio_mount_deg = None
            self._studio_initial_point = None
            if arm is not None:
                with contextlib.suppress(Exception):
                    if int(getattr(arm, "state", STATE_STOP)) == STATE_MOVING:
                        arm.set_state(STATE_STOP)
                with contextlib.suppress(Exception):
                    arm.disconnect()
        return self.snapshot()

    def emergency_cleanup(self) -> None:
        """Stop active motion and disconnect cleanly (used on WS close / server shutdown)."""
        self._stop_seq += 1
        self._cancel_watchdog()
        self._clear_active_vel()
        arm = self._arm
        if arm is not None:
            with contextlib.suppress(Exception):
                arm.set_state(STATE_STOP)
        self.disconnect()

    # -- Status snapshot -----------------------------------------------------
    def _read_hw_enabled(self, arm: Any) -> bool | None:
        """Query hardware motor enable & brake release state from SDK rich report."""
        if self._dof <= 0:
            return None
        mtable = getattr(arm, "motor_enable_states", None)
        if not isinstance(mtable, (list, tuple)) or len(mtable) < self._dof:
            return None
        en = mtable[: self._dof]
        if any(v not in (0, 1) for v in en):
            return None
        if not all(v == 1 for v in en):
            return False
        mtbrake = getattr(arm, "motor_brake_states", None)
        if isinstance(mtbrake, (list, tuple)) and len(mtbrake) >= self._dof:
            br = mtbrake[: self._dof]
            if all(v in (0, 1) for v in br):
                return all(v == 1 for v in br)
        return True

    def _sync_enabled_from_hw(self, arm: Any, error_code: int) -> bool:
        if error_code != 0:
            self._enabled = False
            return False
        if time.monotonic() >= self._enable_grace_until:
            hw_en = self._read_hw_enabled(arm)
            if hw_en is not None:
                self._enabled = hw_en
        return self._enabled

    def _read_q_deg(self, arm: Any) -> list[float]:
        raw = getattr(arm, "angles", None)
        if raw is None or len(raw) < self._dof:
            getter = getattr(arm, "get_servo_angle", None)
            if getter is not None:
                code, vals = getter(is_radian=False)
                if code == 0:
                    raw = vals
        return _float_list(raw, self._dof)

    def _read_tcp_pose(self, arm: Any) -> list[float]:
        raw = getattr(arm, "position", None)
        if raw is None or len(raw) < 6:
            getter = getattr(arm, "get_position", None)
            if getter is not None:
                code, vals = getter(is_radian=False)
                if code == 0:
                    raw = vals
        return _float_list(raw, 6)

    def _resolve_mount_deg(self, gravity: list[float]) -> list[float]:
        if self._studio_mount_deg is not None:
            return list(self._studio_mount_deg)
        return gravity_to_mount_deg(gravity)

    def read_settings(self) -> dict[str, Any]:
        """Fetch read-only controller/Studio settings without blocking motion locks or ``stop()``."""
        arm = self._require_arm()
        dof = self._dof
        mount_val: list[float] | None = None
        init_val: list[float] | None = None

        with warnings.catch_warnings(), contextlib.redirect_stdout(sys.stderr):
            warnings.simplefilter("ignore")
            get_mount = getattr(arm, "get_mount_direction", None)
            if callable(get_mount):
                with contextlib.suppress(Exception):
                    res = get_mount()
                    if (
                        isinstance(res, (list, tuple))
                        and len(res) >= 2
                        and res[0] == 0
                        and isinstance(res[1], (list, tuple))
                        and len(res[1]) >= 2
                    ):
                        tilt = float(res[1][0])
                        rot = float(res[1][1])
                        if math.isfinite(tilt) and math.isfinite(rot):
                            mount_val = [max(0.0, min(180.0, tilt)), max(-180.0, min(180.0, rot))]

            get_init = getattr(arm, "get_initial_point", None)
            if callable(get_init):
                with contextlib.suppress(Exception):
                    res = get_init()
                    if (
                        isinstance(res, (list, tuple))
                        and len(res) >= 2
                        and res[0] == 0
                        and isinstance(res[1], (list, tuple))
                        and dof > 0
                        and len(res[1]) >= dof
                    ):
                        pts = [float(x) for x in res[1][:dof]]
                        if all(math.isfinite(x) for x in pts):
                            init_val = pts

        if self._arm is arm:
            if mount_val is not None:
                self._studio_mount_deg = mount_val
            if init_val is not None:
                self._studio_initial_point = init_val
        return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        arm = self._arm
        if arm is None or not getattr(arm, "connected", False):
            self._enabled = False
            return {
                "connected": False,
                "ip": self._ip,
                "robot_key": "",
                "dof": 0,
                "version": "",
                "sn": "",
                "state": STATE_STOP,
                "mode": MODE_POSITION,
                "error_code": 0,
                "warn_code": 0,
                "enabled": False,
                "is_simulation_robot": False,
                "q_deg": [],
                "tcp_pose": [],
                "tcp_offset": [0.0] * 6,
                "payload": {"mass_kg": 0.0, "com_mm": [0.0, 0.0, 0.0]},
                "collision_sensitivity": None,
                "world_offset": [0.0] * 6,
                "gravity_direction": [0.0, 0.0, -1.0],
                "mount_direction": [0.0, 0.0],
                "initial_point": None,
            }

        error_code = int(getattr(arm, "error_code", 0) or 0)
        warn_code = int(getattr(arm, "warn_code", 0) or 0)
        state = int(getattr(arm, "state", STATE_STOP))
        mode = int(getattr(arm, "mode", MODE_POSITION))
        enabled = self._sync_enabled_from_hw(arm, error_code)

        sn = getattr(arm, "sn", "") or ""
        if not sn:
            get_sn = getattr(arm, "get_robot_sn", None)
            if get_sn is not None:
                with contextlib.suppress(Exception):
                    c, val = get_sn()
                    if c == 0 and isinstance(val, str):
                        sn = val

        gravity = _parse_gravity(getattr(arm, "gravity_direction", None))
        return {
            "connected": True,
            "ip": self._ip,
            "robot_key": self._robot_key,
            "dof": self._dof,
            "version": str(getattr(arm, "version", "") or ""),
            "sn": str(sn),
            "state": state,
            "mode": mode,
            "error_code": error_code,
            "warn_code": warn_code,
            "enabled": bool(enabled),
            "is_simulation_robot": bool(getattr(arm, "is_simulation_robot", False)),
            "q_deg": self._read_q_deg(arm),
            "tcp_pose": self._read_tcp_pose(arm),
            "tcp_offset": _float_list(getattr(arm, "tcp_offset", None), 6),
            "payload": _parse_payload(getattr(arm, "tcp_load", None)),
            "collision_sensitivity": _parse_collision_sensitivity(getattr(arm, "collision_sensitivity", None)),
            "world_offset": _float_list(getattr(arm, "world_offset", None), 6),
            "gravity_direction": gravity,
            "mount_direction": self._resolve_mount_deg(gravity),
            "initial_point": list(self._studio_initial_point) if self._studio_initial_point is not None else None,
        }

    # -- Guards & Mode management --------------------------------------------
    def _require_arm(self) -> Any:
        arm = self._arm
        if arm is None or not getattr(arm, "connected", False):
            raise RpcError(REAL_NOT_CONNECTED, "no real robot connected")
        return arm

    def _check_error_free(self, arm: Any) -> None:
        err = int(getattr(arm, "error_code", 0) or 0)
        if err != 0:
            self._enabled = False
            raise RpcError(
                REAL_CONTROLLER_ERROR,
                f"controller has active error (code={err}); inspect robot and clear error manually",
                {"error_code": err, "warn_code": int(getattr(arm, "warn_code", 0) or 0)},
            )

    def _ensure_mode(self, arm: Any, mode: int) -> None:
        self._check_error_free(arm)
        if not self._sync_enabled_from_hw(arm, 0):
            raise RpcError(REAL_MOTION_REJECTED, "robot is not enabled; enable motors before moving")
        cur_mode = int(getattr(arm, "mode", -1))
        cur_state = int(getattr(arm, "state", STATE_STOP))
        if cur_mode != mode or cur_state in (STATE_PAUSE, STATE_STOP, 5, STATE_DECEL_STOP):
            if cur_mode != mode:
                code = int(arm.set_mode(mode))
                if code != 0:
                    arm.set_state(STATE_STOP)
                    raise RpcError(REAL_MOTION_REJECTED, f"set_mode({mode}) failed with SDK code {code}")
            code = int(arm.set_state(STATE_MOTION))
            if code != 0:
                arm.set_state(STATE_STOP)
                raise RpcError(REAL_MOTION_REJECTED, f"set_state(0) failed with SDK code {code}")
            deadline = time.monotonic() + self._mode_wait_s
            while time.monotonic() < deadline:
                if int(getattr(arm, "mode", -1)) == mode and int(getattr(arm, "state", STATE_STOP)) in (
                    STATE_MOVING,
                    STATE_READY,
                ):
                    break
                time.sleep(0.01)

    def _enable_motion_ready(self, arm: Any, *, after_clear: bool = False) -> bool:
        """Enable motors, switch to Mode 0, and enter Ready state."""
        hw_en = self._read_hw_enabled(arm)
        ops: list[tuple[str, Callable[[], Any]]] = []
        if hw_en is not True:
            ops.append(("motion_enable", lambda: arm.motion_enable(enable=True)))
        if int(getattr(arm, "mode", -1)) != MODE_POSITION:
            ops.append(("set_mode(0)", lambda: arm.set_mode(MODE_POSITION)))
        if int(getattr(arm, "state", STATE_STOP)) not in (STATE_MOVING, STATE_READY):
            ops.append(("set_state(0)", lambda: arm.set_state(STATE_MOTION)))
        for label, op in ops:
            code = int(op())
            if code != 0:
                with contextlib.suppress(Exception):
                    arm.set_state(STATE_STOP)
                self._enabled = False
                if after_clear:
                    self._enable_grace_until = 0.0
                    get_err = getattr(arm, "get_err_warn_code", None)
                    if callable(get_err):
                        with contextlib.suppress(Exception):
                            get_err()
                    if int(getattr(arm, "error_code", 0) or 0) != 0:
                        return False
                    raise RpcError(REAL_MOTION_REJECTED, f"{label} failed after clean_error with SDK code {code}")
                raise RpcError(REAL_MOTION_REJECTED, f"{label} failed with SDK code {code}")
        self._enabled = True
        self._enable_grace_until = time.monotonic() + 0.6
        return True

    # -- Enable / Clear error / Stop -----------------------------------------
    def enable(self, enable: bool) -> dict[str, Any]:
        with self._cmd_lock:
            arm = self._require_arm()
            self._cancel_watchdog()
            self._clear_active_vel()
            if not enable:
                with contextlib.suppress(Exception):
                    arm.set_state(STATE_STOP)
                code = int(arm.motion_enable(enable=False))
                self._enabled = False
                self._enable_grace_until = time.monotonic() + 0.6
                if code != 0:
                    raise RpcError(REAL_MOTION_REJECTED, f"motion_enable(False) failed with SDK code {code}")
                return self.snapshot()

            self._check_error_free(arm)
            self._enable_motion_ready(arm)
            return self.snapshot()

    def clear_error(self, enable: bool = True) -> dict[str, Any]:
        """Explicit user-triggered fault clear following SDK recovery flow. Never called automatically."""
        with self._cmd_lock:
            arm = self._require_arm()
            self._cancel_watchdog()
            self._clear_active_vel()
            arm.clean_warn()
            code = int(arm.clean_error())
            if code != 0:
                raise RpcError(REAL_CONTROLLER_ERROR, f"clean_error failed with SDK code {code}")
            get_err = getattr(arm, "get_err_warn_code", None)
            if callable(get_err):
                with contextlib.suppress(Exception):
                    get_err()
            err_after = int(getattr(arm, "error_code", 0) or 0)
            if err_after != 0:
                self._enabled = False
                self._enable_grace_until = 0.0
                return self.snapshot()
            if enable:
                self._enable_motion_ready(arm, after_clear=True)
            else:
                self._enabled = bool(self._read_hw_enabled(arm) is True)
                self._enable_grace_until = 0.0
            return self.snapshot()

    def stop(self, emergency: bool = False, decel: bool = False) -> dict[str, Any]:
        """Fast-path stop: bypasses ``_cmd_lock`` so STOP is never queued behind slow calls.

        When ``decel=True`` (normal button release), zeroes active velocity streams and requests
        controller deceleration stop ``set_state(6)`` (falling back to ``set_state(4)`` if unsupported).
        """
        self._stop_seq += 1
        self._cancel_watchdog()
        prev_vel_mode = self._active_vel_mode
        self._clear_active_vel()
        arm = self._arm
        if arm is None or not getattr(arm, "connected", False):
            return self.snapshot()
        if emergency:
            self._enabled = False
            self._enable_grace_until = time.monotonic() + 0.6
            with contextlib.suppress(Exception):
                arm.emergency_stop()
        elif decel:
            if prev_vel_mode == MODE_JOINT_VELOCITY:
                with contextlib.suppress(Exception):
                    arm.vc_set_joint_velocity([0.0] * self._dof, is_radian=False, is_sync=True, duration=0)
            elif prev_vel_mode == MODE_CARTESIAN_VELOCITY:
                with contextlib.suppress(Exception):
                    arm.vc_set_cartesian_velocity([0.0] * 6, is_radian=False, is_tool_coord=False, duration=0)
            decel_ok = False
            with contextlib.suppress(Exception):
                decel_ok = int(arm.set_state(STATE_DECEL_STOP)) == 0
            if not decel_ok:
                with contextlib.suppress(Exception):
                    arm.set_state(STATE_STOP)
        else:
            with contextlib.suppress(Exception):
                arm.set_state(STATE_STOP)
        return self.snapshot()

    # -- Motion commands -----------------------------------------------------
    def step_joint(
        self,
        index: int,
        delta_deg: float,
        speed_dps: float,
        boundary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._cmd_lock:
            arm = self._require_arm()
            if not (0 <= index < self._dof):
                raise RpcError(REAL_MOTION_REJECTED, f"joint index {index} out of range for {self._dof}-DOF arm")
            cur_q = self._read_q_deg(arm)
            target_q = list(cur_q)
            target_q[index] += delta_deg
            v = _check_boundary(boundary, self._limits_deg, cur_q, next_q=target_q)
            if v is not None:
                raise _boundary_error(v)
            self._cancel_watchdog()
            self._clear_active_vel()
            self._ensure_mode(arm, MODE_POSITION)
            code = int(
                arm.set_servo_angle(
                    angle=target_q,
                    speed=max(1.0, float(speed_dps)),
                    mvacc=DEFAULT_JOINT_ACC_DPS2,
                    is_radian=False,
                    wait=False,
                )
            )
            if code != 0:
                raise RpcError(REAL_MOTION_REJECTED, f"set_servo_angle rejected with SDK code {code}")
            return {"ok": True, "target_q_deg": target_q}

    def step_tcp(
        self,
        axis: str,
        delta: float,
        speed_mms: float,
        boundary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._cmd_lock:
            arm = self._require_arm()
            if axis not in LINEAR_AXES and axis not in ROT_AXES:
                raise RpcError(REAL_MOTION_REJECTED, f"unknown axis {axis!r}")
            cur_q = self._read_q_deg(arm)
            cur_tcp = self._read_tcp_pose(arm)
            d_si = delta / 1000.0 if axis in LINEAR_AXES else math.radians(delta)
            T = pose_si_to_se3(units.pose_api_to_si(cur_tcp))
            target_tcp = units.pose_si_to_api(se3_to_pose_si(jog_target(T, axis, d_si)))
            v = _check_boundary(boundary, self._limits_deg, cur_q, cur_tcp=cur_tcp, next_tcp=target_tcp)
            if v is not None:
                raise _boundary_error(v)
            self._cancel_watchdog()
            self._clear_active_vel()
            self._ensure_mode(arm, MODE_POSITION)
            code = int(
                arm.set_position(
                    x=target_tcp[0],
                    y=target_tcp[1],
                    z=target_tcp[2],
                    roll=target_tcp[3],
                    pitch=target_tcp[4],
                    yaw=target_tcp[5],
                    speed=max(1.0, float(speed_mms)),
                    mvacc=DEFAULT_TCP_ACC_MMS2,
                    is_radian=False,
                    wait=False,
                )
            )
            if code != 0:
                raise RpcError(REAL_MOTION_REJECTED, f"set_position rejected with SDK code {code}")
            return {"ok": True, "target_tcp_pose": target_tcp}

    def move_joints(
        self,
        q_deg: list[float],
        speed_dps: float,
        boundary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._cmd_lock:
            arm = self._require_arm()
            if len(q_deg) != self._dof:
                raise RpcError(REAL_MOTION_REJECTED, f"expected {self._dof} joint angles, got {len(q_deg)}")
            cur_q = self._read_q_deg(arm)
            v = _check_boundary(boundary, self._limits_deg, cur_q, next_q=q_deg)
            if v is not None:
                raise _boundary_error(v)
            self._cancel_watchdog()
            self._clear_active_vel()
            self._ensure_mode(arm, MODE_POSITION)
            code = int(
                arm.set_servo_angle(
                    angle=list(q_deg),
                    speed=max(1.0, float(speed_dps)),
                    mvacc=DEFAULT_JOINT_ACC_DPS2,
                    is_radian=False,
                    wait=False,
                )
            )
            if code != 0:
                raise RpcError(REAL_MOTION_REJECTED, f"set_servo_angle rejected with SDK code {code}")
            return {"ok": True, "target_q_deg": list(q_deg)}

    def _same_vel_stream(self, arm: Any, mode: int, speeds: list[float]) -> bool:
        """True when already streaming ``speeds`` in ``mode`` and the controller is still running."""
        if (
            self._active_vel_mode != mode
            or self._active_vel is None
            or len(self._active_vel) != len(speeds)
            or not all(abs(a - b) < 1e-4 for a, b in zip(self._active_vel, speeds))
        ):
            return False
        # Wait past the 5 Hz (200 ms) rich-report lag window before trusting state readback.
        if (time.monotonic() - self._vel_started_at) > 0.35:
            cur_state = int(getattr(arm, "state", STATE_STOP))
            if cur_state in (STATE_PAUSE, STATE_STOP, 5, STATE_DECEL_STOP):
                self._cancel_watchdog()
                self._clear_active_vel()
                raise RpcError(REAL_MOTION_REJECTED, f"controller stopped unexpectedly (state={cur_state})")
        return True

    def jog_joint_vel(
        self,
        speeds_dps: list[float],
        duration_s: float = DEFAULT_VEL_DURATION_S,
        boundary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        start_stop_seq = self._stop_seq
        with self._cmd_lock:
            arm = self._require_arm()
            if len(speeds_dps) != self._dof:
                raise RpcError(REAL_MOTION_REJECTED, f"expected {self._dof} joint speeds, got {len(speeds_dps)}")
            if all(abs(v) < 1e-6 for v in speeds_dps):
                self._cancel_watchdog()
                self._clear_active_vel()
                arm.vc_set_joint_velocity([0.0] * self._dof, is_radian=False, is_sync=True, duration=0)
                return {"ok": True}
            self._check_error_free(arm)
            if not self._sync_enabled_from_hw(arm, 0):
                raise RpcError(REAL_MOTION_REJECTED, "robot is not enabled; enable motors before moving")
            cur_q = self._read_q_deg(arm)
            pred_q = [q + v * VEL_LOOKAHEAD_S for q, v in zip(cur_q, speeds_dps)]
            viol = _check_boundary(boundary, self._limits_deg, cur_q, next_q=pred_q)
            if viol is not None:
                self.stop()
                raise _boundary_error(viol)
            dur = max(0.1, min(1.0, float(duration_s)))
            if self._same_vel_stream(arm, MODE_JOINT_VELOCITY, speeds_dps):
                if self._stop_seq != start_stop_seq:
                    return {"ok": False}
                self._arm_watchdog(dur + WATCHDOG_MARGIN_S)
                return {"ok": True}
            self._ensure_mode(arm, MODE_JOINT_VELOCITY)
            if self._stop_seq != start_stop_seq:
                return {"ok": False}
            code = int(
                arm.vc_set_joint_velocity(
                    list(speeds_dps),
                    is_radian=False,
                    is_sync=True,
                    duration=0,
                )
            )
            if code != 0:
                self.stop()
                raise RpcError(REAL_MOTION_REJECTED, f"vc_set_joint_velocity rejected with SDK code {code}")
            self._active_vel_mode = MODE_JOINT_VELOCITY
            self._active_vel = list(speeds_dps)
            self._vel_started_at = time.monotonic()
            self._arm_watchdog(dur + WATCHDOG_MARGIN_S)
            return {"ok": True}

    def jog_tcp_vel(
        self,
        speeds: list[float],
        duration_s: float = DEFAULT_VEL_DURATION_S,
        boundary: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        start_stop_seq = self._stop_seq
        with self._cmd_lock:
            arm = self._require_arm()
            if len(speeds) != 6:
                raise RpcError(REAL_MOTION_REJECTED, f"expected 6 TCP speeds, got {len(speeds)}")
            if all(abs(v) < 1e-6 for v in speeds):
                self._cancel_watchdog()
                self._clear_active_vel()
                arm.vc_set_cartesian_velocity([0.0] * 6, is_radian=False, is_tool_coord=False, duration=0)
                return {"ok": True}
            self._check_error_free(arm)
            if not self._sync_enabled_from_hw(arm, 0):
                raise RpcError(REAL_MOTION_REJECTED, "robot is not enabled; enable motors before moving")
            cur_q = self._read_q_deg(arm)
            cur_tcp = self._read_tcp_pose(arm)
            pred_tcp = [p + v * VEL_LOOKAHEAD_S for p, v in zip(cur_tcp, speeds)]
            viol = _check_boundary(boundary, self._limits_deg, cur_q, cur_tcp=cur_tcp, next_tcp=pred_tcp)
            if viol is not None:
                self.stop()
                raise _boundary_error(viol)
            dur = max(0.1, min(1.0, float(duration_s)))
            if self._same_vel_stream(arm, MODE_CARTESIAN_VELOCITY, speeds):
                if self._stop_seq != start_stop_seq:
                    return {"ok": False}
                self._arm_watchdog(dur + WATCHDOG_MARGIN_S)
                return {"ok": True}
            self._ensure_mode(arm, MODE_CARTESIAN_VELOCITY)
            if self._stop_seq != start_stop_seq:
                return {"ok": False}
            code = int(
                arm.vc_set_cartesian_velocity(
                    list(speeds),
                    is_radian=False,
                    is_tool_coord=False,
                    duration=0,
                )
            )
            if code != 0:
                self.stop()
                raise RpcError(REAL_MOTION_REJECTED, f"vc_set_cartesian_velocity rejected with SDK code {code}")
            self._active_vel_mode = MODE_CARTESIAN_VELOCITY
            self._active_vel = list(speeds)
            self._vel_started_at = time.monotonic()
            self._arm_watchdog(dur + WATCHDOG_MARGIN_S)
            return {"ok": True}

    # -- End-effector / Gripper controls -------------------------------------
    @staticmethod
    def _validate_gripper(gripper: str) -> dict[str, tuple[int, int]]:
        limits = GRIPPER_LIMITS.get(gripper)
        if limits is None:
            raise invalid_params(f"unsupported gripper: {gripper}")
        return limits

    @staticmethod
    def _read_gripper_pos(arm: Any, gripper: str, pos_bounds: tuple[int, int]) -> int | None:
        try:
            if gripper in ("robotiq_2f_85", "robotiq_2f_140"):
                st = arm.robotiq_get_status(3)
                if _sdk_code(st) != 0:
                    return None
                raw_pos = getattr(arm, "robotiq_status", {}).get("gPO")
            elif gripper == "gripper_g2":
                res = arm.get_gripper_g2_position()
                if not isinstance(res, (tuple, list)) or len(res) < 2 or int(res[0]) != 0:
                    return None
                raw_pos = res[1]
            else:
                res = arm.get_bio_gripper_g2_position()
                if not isinstance(res, (tuple, list)) or len(res) < 2 or int(res[0]) != 0:
                    return None
                raw_pos = res[1]
            if isinstance(raw_pos, numbers.Real) and not isinstance(raw_pos, bool) and math.isfinite(float(raw_pos)):
                return _clamp_int(float(raw_pos), pos_bounds)
        except Exception:
            return None
        return None

    def gripper_enable(self, gripper: str) -> dict[str, Any]:
        limits = self._validate_gripper(gripper)
        with self._cmd_lock:
            arm = self._require_arm()
            self._check_error_free(arm)
            if gripper in ("robotiq_2f_85", "robotiq_2f_140"):
                code = _sdk_code(arm.robotiq_set_activate(wait=True, timeout=3))
            elif gripper == "gripper_g2":
                code = _sdk_code(arm.set_gripper_enable(True))
            else:
                code = _sdk_code(arm.set_bio_gripper_enable(True, wait=True, timeout=3))
            if code != 0:
                raise RpcError(REAL_MOTION_REJECTED, f"{gripper} enable failed with SDK code {code}")
            pos = self._read_gripper_pos(arm, gripper, limits["pos"])
            return {"ok": True, "gripper": gripper, "enabled": True, "pos": pos}

    def gripper_move(self, gripper: str, pos: float, speed: float, force: float) -> dict[str, Any]:
        limits = self._validate_gripper(gripper)
        p = _clamp_int(pos, limits["pos"])
        s = _clamp_int(speed, limits["speed"])
        f = _clamp_int(force, limits["force"])
        with self._cmd_lock:
            arm = self._require_arm()
            self._check_error_free(arm)
            if gripper in ("robotiq_2f_85", "robotiq_2f_140"):
                res = arm.robotiq_set_position(p, speed=s, force=f, wait=False)
            elif gripper == "gripper_g2":
                res = arm.set_gripper_g2_position(p, speed=s, force=f, wait=False)
            else:
                res = arm.set_bio_gripper_g2_position(p, speed=s, force=f, wait=False)
            code = _sdk_code(res)
            if code != 0:
                raise RpcError(REAL_MOTION_REJECTED, f"{gripper} move failed with SDK code {code}")
            return {"ok": True, "gripper": gripper, "pos": p, "speed": s, "force": f}


__all__ = [
    "CONTROLLER_MODEL_MAP",
    "DEFAULT_REAL_IP",
    "DEFAULT_VEL_DURATION_S",
    "GRIPPER_LIMITS",
    "MODE_CARTESIAN_VELOCITY",
    "MODE_JOINT_VELOCITY",
    "MODE_POSITION",
    "RealXArmController",
    "STATE_DECEL_STOP",
    "STATE_MOTION",
    "STATE_MOVING",
    "STATE_PAUSE",
    "STATE_READY",
    "STATE_STOP",
    "gravity_to_mount_deg",
]
