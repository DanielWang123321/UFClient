"""Unit & JSON-RPC tests for real xArm controller (mocked XArmAPI, zero hardware needed)."""

from __future__ import annotations

import threading
import time

import pytest

from ugclient_core import errors
from ugclient_core.backend.real_xarm import (
    MODE_CARTESIAN_VELOCITY,
    MODE_JOINT_VELOCITY,
    MODE_POSITION,
    STATE_DECEL_STOP,
    STATE_MOVING,
    STATE_READY,
    STATE_STOP,
    RealXArmController,
)
from ugclient_core.rpc import Connection
from ugclient_core.session import SessionStore


class FakeXArm:
    """In-memory stand-in for ``xarm.wrapper.XArmAPI`` (7-slot angle readback like real SDK)."""

    def __init__(
        self,
        ip: str,
        *,
        axis: int = 6,
        device_type: int = 6,
        connected: bool = True,
        error_code: int = 0,
        warn_code: int = 0,
        motors_enabled: bool = False,
        decel_stop_code: int = 0,
    ) -> None:
        self.ip = ip
        self.axis = axis
        self.device_type = device_type
        self.connected = connected
        self.error_code = error_code
        self.warn_code = warn_code
        self.state = STATE_READY if motors_enabled and error_code == 0 else STATE_STOP
        self.mode = MODE_POSITION
        self.version = "2.8.1"
        self.sn = "XI1305060001"
        self.is_simulation_robot = False
        self.motor_enable_states = ([1] * axis if motors_enabled else [0] * axis) + [0] * (8 - axis)
        self.motor_brake_states = ([1] * axis if motors_enabled else [0] * axis) + [0] * (8 - axis)
        self._decel_stop_code = decel_stop_code
        # Real xArm SDK pads angles to 7 entries even on 6-axis xArm6.
        self.angles = [10.0, -20.0, -30.0, 0.0, 50.0, 15.0, 0.0]
        self.position = [320.0, 10.0, 250.0, 180.0, 0.0, 0.0]
        self.tcp_offset = [0.0, 0.0, 173.5, 0.0, 0.0, 0.0]
        self.tcp_load = [1.2, [0.0, 0.0, 45.0]]
        self.calls: list[tuple[str, tuple, dict]] = []

    def disconnect(self) -> None:
        self.calls.append(("disconnect", (), {}))
        self.connected = False

    def motion_enable(self, enable: bool = True) -> int:
        self.calls.append(("motion_enable", (enable,), {}))
        val = 1 if enable else 0
        self.motor_enable_states = [val] * self.axis + [0] * (8 - self.axis)
        self.motor_brake_states = [val] * self.axis + [0] * (8 - self.axis)
        return 0

    def set_mode(self, mode: int = 0) -> int:
        self.calls.append(("set_mode", (mode,), {}))
        self.mode = mode
        return 0

    def set_state(self, state: int = 0) -> int:
        self.calls.append(("set_state", (state,), {}))
        if state == STATE_DECEL_STOP and self._decel_stop_code != 0:
            return self._decel_stop_code
        self.state = STATE_READY if state == 0 else state
        return 0

    def emergency_stop(self) -> int:
        self.calls.append(("emergency_stop", (), {}))
        self.state = STATE_STOP
        self.motor_enable_states = [0] * 8
        self.motor_brake_states = [0] * 8
        return 0

    def clean_error(self) -> int:
        self.calls.append(("clean_error", (), {}))
        self.error_code = 0
        return 0

    def clean_warn(self) -> int:
        self.calls.append(("clean_warn", (), {}))
        self.warn_code = 0
        return 0

    def set_servo_angle(self, **kwargs) -> int:
        self.calls.append(("set_servo_angle", (), kwargs))
        ang = kwargs["angle"]
        self.angles = [*ang, *([0.0] * (7 - len(ang)))]
        return 0

    def set_position(self, **kwargs) -> int:
        self.calls.append(("set_position", (), kwargs))
        self.position = [kwargs[k] for k in ("x", "y", "z", "roll", "pitch", "yaw")]
        return 0

    def vc_set_joint_velocity(self, speeds, **kwargs) -> int:
        self.calls.append(("vc_set_joint_velocity", (list(speeds),), kwargs))
        self.state = STATE_MOVING if any(abs(v) > 0 for v in speeds) else STATE_READY
        return 0

    def vc_set_cartesian_velocity(self, speeds, **kwargs) -> int:
        self.calls.append(("vc_set_cartesian_velocity", (list(speeds),), kwargs))
        self.state = STATE_MOVING if any(abs(v) > 0 for v in speeds) else STATE_READY
        return 0

    def set_tcp_offset(self, offset, **kwargs) -> int:
        self.calls.append(("set_tcp_offset", (list(offset),), kwargs))
        self.tcp_offset = list(offset)
        return 0

    def set_tcp_load(self, weight, center_of_gravity, **kwargs) -> int:
        self.calls.append(("set_tcp_load", (weight, list(center_of_gravity)), kwargs))
        self.tcp_load = [weight, list(center_of_gravity)]
        return 0


class RpcHarness:
    def __init__(self, arm_factory) -> None:
        self.real = RealXArmController(arm_factory=arm_factory, connect_wait_s=0.05, mode_wait_s=0.05)
        self.conn = Connection("tok", SessionStore(real=self.real))
        self.n = 0
        assert "result" in self.raw("system.hello", {"token": "tok"})

    def raw(self, method: str, params: dict | None = None) -> dict:
        self.n += 1
        return self.conn.handle_obj({"jsonrpc": "2.0", "id": self.n, "method": method, "params": params or {}})

    def call(self, method: str, **params) -> dict:
        r = self.raw(method, params)
        assert "result" in r, r
        return r["result"]


def test_connect_xarm6_reads_state_and_starts_monitor_only():
    arms: list[FakeXArm] = []

    def mk(ip: str) -> FakeXArm:
        a = FakeXArm(ip, axis=6, device_type=6)
        arms.append(a)
        return a

    h = RpcHarness(mk)
    snap = h.call("real.connect", ip="192.168.1.60")
    assert snap["connected"] is True
    assert snap["ip"] == "192.168.1.60"
    assert snap["robot_key"] == "xarm6_1305"
    assert snap["dof"] == 6
    assert len(snap["q_deg"]) == 6  # sliced from 7-slot SDK array
    assert snap["q_deg"][0] == pytest.approx(10.0)
    assert snap["tcp_offset"] == [0.0, 0.0, 173.5, 0.0, 0.0, 0.0]
    assert snap["payload"] == {"mass_kg": 1.2, "com_mm": [0.0, 0.0, 45.0]}
    assert snap["enabled"] is False
    # Never auto-clears errors or auto-enables on connect
    assert not any(c[0] in ("clean_error", "clean_warn", "motion_enable") for c in arms[0].calls)

    # Motion is refused while motors are disabled
    err = h.raw("real.step_joint", {"index": 0, "delta_deg": 1.0, "speed_dps": 10.0})
    assert err["error"]["code"] == errors.REAL_MOTION_REJECTED


def test_connect_detects_already_enabled_motors_and_decel_stop():
    arm = FakeXArm("192.168.1.60", axis=6, device_type=6, motors_enabled=True)
    h = RpcHarness(lambda _ip: arm)
    snap = h.call("real.connect", ip="192.168.1.60")
    assert snap["enabled"] is True
    assert not any(c[0] == "motion_enable" for c in arm.calls)

    # Already enabled -> jog works immediately without calling real.enable
    h.call("real.jog_tcp_vel", speeds=[20.0, 0, 0, 0, 0, 0], duration_s=0.4)
    assert arm.mode == MODE_CARTESIAN_VELOCITY

    # Deceleration stop on button release zeroes velocity and calls set_state(6)
    h.call("real.stop", decel=True)
    tcp_calls = [c for c in arm.calls if c[0] == "vc_set_cartesian_velocity"]
    assert tcp_calls[-1][1] == ([0.0, 0.0, 0.0, 0.0, 0.0, 0.0],)
    assert ("set_state", (STATE_DECEL_STOP,), {}) in arm.calls
    assert arm.state == STATE_DECEL_STOP

    # Fallback to set_state(4) if firmware rejects set_state(6)
    arm_legacy = FakeXArm("192.168.1.60", axis=6, device_type=6, motors_enabled=True, decel_stop_code=-1)
    h2 = RpcHarness(lambda _ip: arm_legacy)
    h2.call("real.connect", ip="192.168.1.60")
    h2.call("real.stop", decel=True)
    assert ("set_state", (STATE_DECEL_STOP,), {}) in arm_legacy.calls
    assert ("set_state", (STATE_STOP,), {}) in arm_legacy.calls
    assert arm_legacy.state == STATE_STOP
    h.call("real.disconnect")
    h2.call("real.disconnect")


def test_model_mismatch_and_connect_failure():
    lite6_arm = FakeXArm("192.168.1.60", axis=6, device_type=9)
    h = RpcHarness(lambda _ip: lite6_arm)
    r = h.raw("real.connect", {"ip": "192.168.1.60", "robot": "xarm6_1305"})
    assert r["error"]["code"] == errors.REAL_MODEL_MISMATCH
    assert lite6_arm.connected is False

    unknown_arm = FakeXArm("192.168.1.60", axis=6, device_type=99)
    h2 = RpcHarness(lambda _ip: unknown_arm)
    r2 = h2.raw("real.connect", {"ip": "192.168.1.60"})
    assert r2["error"]["code"] == errors.REAL_MODEL_MISMATCH
    assert unknown_arm.connected is False

    h3 = RpcHarness(lambda ip: FakeXArm(ip, connected=False))
    r3 = h3.raw("real.connect", {"ip": "192.168.1.60"})
    assert r3["error"]["code"] == errors.REAL_CONNECT_FAILED

    assert h3.raw("real.enable", {"enable": True})["error"]["code"] == errors.REAL_NOT_CONNECTED


def test_never_auto_clears_error_and_requires_manual_clear():
    arm = FakeXArm("192.168.1.60", error_code=23, warn_code=11)
    h = RpcHarness(lambda _ip: arm)
    snap = h.call("real.connect", ip="192.168.1.60")
    assert snap["error_code"] == 23

    # Refuses enable while error active, and does not call clean_error
    r = h.raw("real.enable", {"enable": True})
    assert r["error"]["code"] == errors.REAL_CONTROLLER_ERROR
    assert not any(c[0] == "clean_error" for c in arm.calls)

    # Explicit user clear_error clears warn+error but keeps motors disabled until explicit enable
    cleared = h.call("real.clear_error")
    assert cleared["error_code"] == 0 and cleared["warn_code"] == 0
    assert cleared["enabled"] is False
    assert any(c[0] == "clean_error" for c in arm.calls)

    enabled = h.call("real.enable", enable=True)
    assert enabled["enabled"] is True


def test_step_joint_tcp_and_safety_boundary():
    arm = FakeXArm("192.168.1.60")
    h = RpcHarness(lambda _ip: arm)
    h.call("real.connect", ip="192.168.1.60")
    h.call("real.enable", enable=True)

    # Valid joint step
    res = h.call("real.step_joint", index=0, delta_deg=2.0, speed_dps=10.0)
    assert res["target_q_deg"][0] == pytest.approx(12.0)
    assert arm.mode == MODE_POSITION

    # Blocked by joint safety boundary
    b = {
        "joint_min": [-360] * 6,
        "joint_max": [12.5, 120, 11, 360, 180, 360],
        "tcp_min": [None] * 3,
        "tcp_max": [None] * 3,
    }
    blocked = h.raw("real.step_joint", {"index": 0, "delta_deg": 2.0, "speed_dps": 10.0, "boundary": b})
    assert blocked["error"]["code"] == errors.REAL_MOTION_REJECTED
    assert blocked["error"]["data"]["boundary"] == {"kind": "joint", "index": 0, "side": "max", "limit": 12.5}

    # Valid TCP linear step + rotation step
    res_tcp = h.call("real.step_tcp", axis="z", delta=5.0, speed_mms=40.0)
    assert res_tcp["target_tcp_pose"][2] == pytest.approx(255.0)
    res_rot = h.call("real.step_tcp", axis="yaw", delta=5.0, speed_mms=40.0)
    assert res_rot["target_tcp_pose"][5] == pytest.approx(5.0, abs=1e-3)

    # Blocked by TCP safety boundary
    b_tcp = {
        "tcp_min": [None, None, None],
        "tcp_max": [None, None, 256.0],
        "joint_min": [-360] * 6,
        "joint_max": [360] * 6,
    }
    blocked_tcp = h.raw("real.step_tcp", {"axis": "z", "delta": 5.0, "speed_mms": 40.0, "boundary": b_tcp})
    assert blocked_tcp["error"]["code"] == errors.REAL_MOTION_REJECTED
    assert blocked_tcp["error"]["data"]["boundary"] == {"kind": "tcp", "axis": 2, "side": "max", "limit": 256.0}


def test_velocity_jog_modes_watchdog_and_boundary():
    arm = FakeXArm("192.168.1.60")
    h = RpcHarness(lambda _ip: arm)
    h.call("real.connect", ip="192.168.1.60")
    h.call("real.enable", enable=True)

    # Mode 4 joint velocity sends duration=0 once; identical heartbeats refresh watchdog without resending SDK cmds
    h.call("real.jog_joint_vel", speeds_dps=[5.0, 0, 0, 0, 0, 0], duration_s=0.1)
    assert arm.mode == MODE_JOINT_VELOCITY
    joint_vel_calls = [c for c in arm.calls if c[0] == "vc_set_joint_velocity"]
    assert len(joint_vel_calls) == 1
    assert joint_vel_calls[0][2]["duration"] == 0

    h.call("real.jog_joint_vel", speeds_dps=[5.0, 0, 0, 0, 0, 0], duration_s=0.1)
    h.call("real.jog_joint_vel", speeds_dps=[5.0, 0, 0, 0, 0, 0], duration_s=0.1)
    assert len([c for c in arm.calls if c[0] == "vc_set_joint_velocity"]) == 1

    # Speed change sends updated continuous velocity once
    h.call("real.jog_joint_vel", speeds_dps=[8.0, 0, 0, 0, 0, 0], duration_s=0.1)
    joint_vel_calls = [c for c in arm.calls if c[0] == "vc_set_joint_velocity"]
    assert len(joint_vel_calls) == 2
    assert joint_vel_calls[-1][1] == ([8.0, 0, 0, 0, 0, 0],)
    assert joint_vel_calls[-1][2]["duration"] == 0

    # Wait past duration + margin without heartbeats -> sidecar watchdog calls set_state(4)
    time.sleep(0.32)
    assert arm.state == STATE_STOP

    # Mode 5 Cartesian velocity sends duration=0 once across identical heartbeats + lookahead boundary stop
    h.call("real.jog_tcp_vel", speeds=[20.0, 0, 0, 0, 0, 0], duration_s=0.4)
    assert arm.mode == MODE_CARTESIAN_VELOCITY
    h.call("real.jog_tcp_vel", speeds=[20.0, 0, 0, 0, 0, 0], duration_s=0.4)
    h.call("real.jog_tcp_vel", speeds=[20.0, 0, 0, 0, 0, 0], duration_s=0.4)
    tcp_vel_calls = [c for c in arm.calls if c[0] == "vc_set_cartesian_velocity"]
    assert len(tcp_vel_calls) == 1
    assert tcp_vel_calls[0][2]["duration"] == 0

    b = {"tcp_min": [None] * 3, "tcp_max": [321.0, None, None], "joint_min": [-360] * 6, "joint_max": [360] * 6}
    blocked = h.raw("real.jog_tcp_vel", {"speeds": [50.0, 0, 0, 0, 0, 0], "duration_s": 0.4, "boundary": b})
    assert blocked["error"]["code"] == errors.REAL_MOTION_REJECTED
    assert arm.state == STATE_STOP
    h.call("real.disconnect")


def test_stop_bypasses_command_lock_and_tcp_payload_guards():
    arm = FakeXArm("192.168.1.60")
    h = RpcHarness(lambda _ip: arm)
    h.call("real.connect", ip="192.168.1.60")
    h.call("real.enable", enable=True)

    # Hold _cmd_lock in another thread and verify real.stop still finishes immediately
    entered = threading.Event()
    release = threading.Event()

    def hold_lock():
        with h.real._cmd_lock:
            entered.set()
            release.wait(timeout=2.0)

    t = threading.Thread(target=hold_lock)
    t.start()
    entered.wait(timeout=1.0)
    try:
        t0 = time.monotonic()
        h.call("real.stop")
        assert time.monotonic() - t0 < 0.2
        assert any(c == ("set_state", (STATE_STOP,), {}) for c in arm.calls)
    finally:
        release.set()
        t.join(timeout=2.0)

    # TCP / Payload write-back refused while moving, allowed when stationary
    arm.state = STATE_MOVING
    r_tcp = h.raw("real.set_tcp", {"offset": [0, 0, 100, 0, 0, 0]})
    assert r_tcp["error"]["code"] == errors.REAL_MOTION_REJECTED
    r_pl = h.raw("real.set_payload", {"mass_kg": 2.0, "com_mm": [0, 0, 20]})
    assert r_pl["error"]["code"] == errors.REAL_MOTION_REJECTED

    arm.state = STATE_READY
    snap1 = h.call("real.set_tcp", offset=[0, 0, 100, 0, 0, 0])
    assert snap1["tcp_offset"] == [0.0, 0.0, 100.0, 0.0, 0.0, 0.0]
    snap2 = h.call("real.set_payload", mass_kg=2.0, com_mm=[0, 0, 20])
    assert snap2["payload"] == {"mass_kg": 2.0, "com_mm": [0.0, 0.0, 20.0]}

    # Emergency stop drops enabled
    snap_em = h.call("real.stop", emergency=True)
    assert snap_em["enabled"] is False
    assert any(c[0] == "emergency_stop" for c in arm.calls)
    h.call("real.disconnect")
