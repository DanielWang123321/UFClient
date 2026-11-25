"""JSON-RPC handlers for real UFACTORY robot control (``real.*``)."""

from __future__ import annotations

from typing import Any

from ..backend.real_xarm import DEFAULT_REAL_IP, DEFAULT_VEL_DURATION_S
from ..errors import invalid_params
from ..session import SessionStore
from ._params import number, vec


def _opt_boundary(params: dict[str, Any]) -> dict[str, Any] | None:
    b = params.get("boundary")
    if b is None:
        return None
    if not isinstance(b, dict):
        raise invalid_params("boundary must be an object")
    return b


def _opt_bool(params: dict[str, Any], name: str, default: bool = False) -> bool:
    v = params.get(name, default)
    if not isinstance(v, bool):
        raise invalid_params(f"{name} must be a boolean")
    return v


def _int_param(params: dict[str, Any], name: str) -> int:
    v = params.get(name)
    if isinstance(v, bool) or not isinstance(v, int):
        raise invalid_params(f"{name} must be an integer")
    return v


def real_connect(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    ip = params.get("ip", DEFAULT_REAL_IP)
    if not isinstance(ip, str) or not ip.strip():
        raise invalid_params("ip must be a non-empty string")
    robot = params.get("robot")
    if robot is not None and not isinstance(robot, str):
        raise invalid_params("robot must be a string")
    return store.real.connect(ip, expected_robot=robot)


def real_disconnect(_: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    return store.real.disconnect()


def real_status(_: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    return store.real.snapshot()


def real_enable(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    if "enable" not in params or not isinstance(params["enable"], bool):
        raise invalid_params("enable must be a boolean")
    return store.real.enable(params["enable"])


def real_clear_error(_: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    return store.real.clear_error()


def real_stop(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    emergency = _opt_bool(params, "emergency", False)
    decel = _opt_bool(params, "decel", False)
    return store.real.stop(emergency=emergency, decel=decel)


def real_step_joint(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    idx = _int_param(params, "index")
    delta_deg = number(params, "delta_deg")
    speed_dps = number(params, "speed_dps", 10.0)
    if speed_dps <= 0:
        raise invalid_params("speed_dps must be > 0")
    return store.real.step_joint(idx, delta_deg, speed_dps, boundary=_opt_boundary(params))


def real_step_tcp(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    axis = params.get("axis")
    if not isinstance(axis, str) or not axis:
        raise invalid_params("axis must be a non-empty string")
    delta = number(params, "delta")
    speed_mms = number(params, "speed_mms", 50.0)
    if speed_mms <= 0:
        raise invalid_params("speed_mms must be > 0")
    return store.real.step_tcp(axis, delta, speed_mms, boundary=_opt_boundary(params))


def real_move_joints(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    q_raw = params.get("q_deg")
    if not isinstance(q_raw, list) or not q_raw:
        raise invalid_params("q_deg must be a non-empty array")
    q = vec(params, "q_deg", len(q_raw)).tolist()
    speed_dps = number(params, "speed_dps", 10.0)
    if speed_dps <= 0:
        raise invalid_params("speed_dps must be > 0")
    return store.real.move_joints(q, speed_dps, boundary=_opt_boundary(params))


def real_jog_joint_vel(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    raw = params.get("speeds_dps")
    if not isinstance(raw, list) or not raw:
        raise invalid_params("speeds_dps must be a non-empty array")
    speeds = vec(params, "speeds_dps", len(raw)).tolist()
    dur = number(params, "duration_s", DEFAULT_VEL_DURATION_S)
    if dur <= 0:
        raise invalid_params("duration_s must be > 0")
    return store.real.jog_joint_vel(speeds, duration_s=dur, boundary=_opt_boundary(params))


def real_jog_tcp_vel(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    speeds = vec(params, "speeds", 6).tolist()
    dur = number(params, "duration_s", DEFAULT_VEL_DURATION_S)
    if dur <= 0:
        raise invalid_params("duration_s must be > 0")
    return store.real.jog_tcp_vel(speeds, duration_s=dur, boundary=_opt_boundary(params))


def real_set_tcp(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    offset = vec(params, "offset", 6).tolist()
    return store.real.set_tcp(offset)


def real_set_payload(params: dict[str, Any], store: SessionStore) -> dict[str, Any]:
    mass = number(params, "mass_kg")
    if mass < 0:
        raise invalid_params("mass_kg must be >= 0")
    com = vec(params, "com_mm", 3).tolist()
    return store.real.set_payload(mass, com)
