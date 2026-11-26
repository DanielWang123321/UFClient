"""API validation, error codes, version negotiation, units (design doc §11)."""

import numpy as np
import pytest

from ugclient_core import errors, units
from ugclient_core.rpc import Connection
from ugclient_core.session import SessionStore


def test_auth_required():
    c = Connection("secret", SessionStore())
    r = c.handle_obj({"jsonrpc": "2.0", "id": 1, "method": "robot.list"})
    assert r["error"]["code"] == errors.AUTH_FAILED
    r = c.handle_obj({"jsonrpc": "2.0", "id": 2, "method": "system.hello", "params": {"token": "nope"}})
    assert r["error"]["code"] == errors.AUTH_FAILED


def test_api_major_mismatch():
    c = Connection("t", SessionStore())
    r = c.handle_obj(
        {"jsonrpc": "2.0", "id": 1, "method": "system.hello", "params": {"token": "t", "api_version": "2.0"}}
    )
    assert r["error"]["code"] == errors.API_VERSION_MISMATCH


def test_hello_and_ping(client):
    assert client.call("ping") == "pong"
    h = client.call("system.hello", token="t0k")
    assert h["api_version"] == "1.0" and h["pinocchio_version"] == "4.0.0"
    assert h["backend"] == {"kin": "ugclient", "dyn": "ugclient"}


def test_robot_list_supported_models(client):
    keys = [r["key"] for r in client.call("robot.list")]
    assert keys == ["uf850", "xarm5_1305", "xarm6_1305", "xarm7_1305", "lite6"]


def test_robot_info_reads_max_torques_from_ufactory_genesis(client):
    from ufactory.config.loader import load_runtime_config

    info = client.call("robot.info", robot="uf850")
    assert info["effort_limits_nm"] == list(load_runtime_config("uf850").arm.effort_limits_nm)
    assert info["visual_urdf_relpath"] == "urdf/uf850/uf850_visual.glb.urdf"
    assert info["dof"] == 6 and info["joint_names"][0] == "joint1"


@pytest.mark.parametrize("bad", ["xarm6", "xarm6_1300", "nope"])
def test_unknown_robot(client, bad):
    assert client.raw("robot.info", {"robot": bad})["error"]["code"] == errors.ROBOT_NOT_FOUND


def test_bad_params(client):
    s = client.call("robot.load", robot="lite6")
    r = client.raw("dyn.gravity", {"session_id": s["session_id"], "q_deg": [0, 0, 0]})
    assert r["error"]["code"] == errors.INVALID_PARAMS
    r = client.raw("payload.set", {"session_id": s["session_id"], "mass_kg": -1, "com_mm": [0, 0, 0]})
    assert r["error"]["code"] == errors.INVALID_PARAMS
    assert client.raw("dyn.gravity", {"session_id": "x", "q_deg": [0] * 6})["error"]["code"] == errors.SESSION_NOT_FOUND
    assert client.raw("nope.nope")["error"]["code"] == errors.METHOD_NOT_FOUND


def test_invalid_request_and_parse_error():
    c = Connection("t", SessionStore())
    assert '"code": -32700' in c.handle_text("{not json")
    assert c.handle_obj({"id": 1, "method": "x"})["error"]["code"] == errors.INVALID_REQUEST


def test_units_roundtrip():
    p = [830.0, -12.5, 200.0, -180.0, 10.0, 45.0]
    np.testing.assert_allclose(units.pose_si_to_api(units.pose_api_to_si(p)), p)
    np.testing.assert_allclose(units.rad_to_deg(units.deg_to_rad([1, 2, 3])), [1, 2, 3])


def test_unreachable_pose(client):
    s = client.call("robot.load", robot="lite6")
    r = client.raw("kin.ik", {"session_id": s["session_id"], "target_pose": [5000, 0, 0, 0, 0, 0]})
    assert r["error"]["code"] == errors.IK_NOT_CONVERGED


def test_schema_lists_every_method():
    import json
    from pathlib import Path

    from ugclient_core.rpc import METHODS

    schema = json.loads((Path(__file__).resolve().parents[2] / "schema" / "api.v1.json").read_text(encoding="utf-8"))
    assert set(METHODS) | {"system.hello", "system.shutdown", "ping"} == set(schema["methods"])


def test_end_effector_combinations_and_default_tcp(client):
    """Every supported arm x end effector loads, reads its default TCP from the upstream composed URDF,
    and is visual only (gravity torques do not change)."""
    expected = {
        "uf850": {"none", "gripper_g2", "bio_gripper_g2", "vacuum_gripper", "robotiq_2f_85", "robotiq_2f_140"},
        "xarm5_1305": {"none", "gripper_g2", "bio_gripper_g2", "vacuum_gripper", "robotiq_2f_85", "robotiq_2f_140"},
        "xarm6_1305": {"none", "gripper_g2", "bio_gripper_g2", "vacuum_gripper", "robotiq_2f_85", "robotiq_2f_140"},
        "xarm7_1305": {"none", "gripper_g2", "bio_gripper_g2", "vacuum_gripper", "robotiq_2f_85", "robotiq_2f_140"},
        "lite6": {"none", "lite6_gripper", "lite6_vacuum_gripper"},
    }
    expected_tcp = {
        "none": [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        "gripper_g2": [0.0, 0.0, 173.5, 0.0, 0.0, 0.0],
        "bio_gripper_g2": [157.639, -0.035, 57.516, 0.0, 0.0, -0.36],
        "vacuum_gripper": [0.0, 0.0, 126.0, 0.0, 0.0, 0.0],
        "robotiq_2f_85": [0.0, 0.0, 173.253, 0.0, 0.0, 0.0],
        "robotiq_2f_140": [0.0, 0.0, 245.466, 0.0, 0.0, 0.0],
        "lite6_gripper": [0.0, 0.0, 83.6, 0.0, 0.0, 0.0],
        "lite6_vacuum_gripper": [0.0, 0.0, 61.0, 0.0, 0.0, 0.0],
    }
    for r in client.call("robot.list"):
        assert set(r["end_effectors"]) == expected[r["key"]]
        q = [10.0, -30.0, -40.0, 20.0, 35.0, 0.0, 5.0][: r["dof"]]
        base = None
        for ee in r["end_effectors"]:
            s = client.call("robot.load", robot=r["key"], end_effector=ee)
            assert s["end_effector"] == ee
            off = s["default_tcp_offset"]
            assert len(off) == 6
            assert off == pytest.approx(expected_tcp[ee], abs=1e-3)
            if ee == "none":
                assert s["default_tcp_source"] == "none"
            else:
                assert s["default_tcp_source"].startswith(f"urdf:{r['key']}__{ee}__glb.urdf#")
            tau = client.call("dyn.gravity", session_id=s["session_id"], q_deg=q)["tau_nm"]
            base = base or tau
            np.testing.assert_allclose(tau, base, atol=1e-12)  # end effector adds no mass


def test_g2_and_lite6_default_tcp_from_upstream_urdf(client):
    """Regression: default TCP comes from the upstream composed URDF tcp joint, not ``tool_tip_offset_z_m``."""
    s = client.call("robot.info", robot="uf850", end_effector="gripper_g2")
    assert s["default_tcp_offset"] == pytest.approx([0, 0, 173.5, 0, 0, 0])
    assert s["default_tcp_source"] == "urdf:uf850__gripper_g2__glb.urdf#joint_tcp"
    s = client.call("robot.info", robot="lite6", end_effector="lite6_gripper")
    assert s["default_tcp_offset"] == pytest.approx([0, 0, 83.6, 0, 0, 0])
    s = client.call("robot.info", robot="lite6", end_effector="lite6_vacuum_gripper")
    assert s["default_tcp_offset"] == pytest.approx([0, 0, 61.0, 0, 0, 0])
    assert s["default_tcp_source"] == "urdf:lite6__lite6_vacuum_gripper__glb.urdf#joint_tcp"


def test_synced_assets_cover_every_visual_urdf(tmp_path):
    """Regression: composed URDFs, cross-arm xArm6 meshes and gripper GLBs are all synced cleanly."""
    import importlib.util
    from pathlib import Path

    from ugclient_core.backend import factory

    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location("sync_assets", root / "scripts" / "sync_assets.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from ufactory.robots.registry import PROJECT_ROOT

    dst = tmp_path / "urdf"
    mod.sync(Path(PROJECT_ROOT) / "assets" / "urdf", dst)
    cat = factory.catalog()
    for key in cat.list_keys():
        for ee in cat.end_effectors(key):
            rel = cat.info(key, ee).visual_urdf_relpath  # "urdf/<robot>/<file>" or "urdf/composed/<file>"
            urdf = dst / Path(rel).relative_to("urdf")
            assert urdf.is_file(), rel
            meshes = mod.visual_meshes(urdf)
            assert meshes, rel
            for m in meshes:
                assert m.suffix.lower() in {".glb", ".stl"} and m.is_file(), f"{rel}: {m}"


def test_bio_g2_and_vacuum_default_tcp_from_upstream_urdf(client):
    """BIO G2, xArm Vacuum Gripper, and Robotiq 2F-85/2F-140 read default TCPs directly from upstream v0.3.10 URDFs."""
    for robot in ("uf850", "xarm5_1305", "xarm6_1305", "xarm7_1305"):
        bio = client.call("robot.info", robot=robot, end_effector="bio_gripper_g2")
        assert bio["default_tcp_offset"] == pytest.approx([157.639, -0.035, 57.516, 0.0, 0.0, -0.36], abs=1e-3)
        assert bio["default_tcp_source"] == f"urdf:{robot}__bio_gripper_g2__glb.urdf#bio_gripper_g2_tcp_joint"
        vac = client.call("robot.info", robot=robot, end_effector="vacuum_gripper")
        assert vac["default_tcp_offset"] == pytest.approx([0.0, 0.0, 126.0, 0.0, 0.0, 0.0], abs=1e-3)
        assert vac["default_tcp_source"] == f"urdf:{robot}__vacuum_gripper__glb.urdf#vacuum_joint_tcp"
        rq85 = client.call("robot.info", robot=robot, end_effector="robotiq_2f_85")
        assert rq85["default_tcp_offset"] == pytest.approx([0.0, 0.0, 173.253, 0.0, 0.0, 0.0], abs=1e-3)
        assert rq85["default_tcp_source"] == f"urdf:{robot}__robotiq_2f_85__glb.urdf#robotiq_2f_85_tcp_joint"
        rq140 = client.call("robot.info", robot=robot, end_effector="robotiq_2f_140")
        assert rq140["default_tcp_offset"] == pytest.approx([0.0, 0.0, 245.466, 0.0, 0.0, 0.0], abs=1e-3)
        assert rq140["default_tcp_source"] == f"urdf:{robot}__robotiq_2f_140__glb.urdf#robotiq_2f_140_tcp_joint"
    assert client.raw("robot.info", {"robot": "lite6", "end_effector": "robotiq_2f_85"})["error"]["code"] == (
        errors.INVALID_PARAMS
    )


def test_factory_loads_urdf_from_non_ascii_path(tmp_path):
    """Windows non-ASCII install/user paths must load URDFs cleanly via UTF-8 XML."""
    import shutil
    from dataclasses import replace
    from pathlib import Path

    from ugclient_core.backend import factory

    info = factory.catalog().info("uf850")
    non_ascii_dir = tmp_path / "中文路径"
    non_ascii_dir.mkdir(parents=True)
    src_urdf = Path(info.urdf_path)
    urdf_copy = non_ascii_dir / src_urdf.name
    shutil.copy2(src_urdf, urdf_copy)

    ref = factory.create(info)
    copied = factory.create(replace(info, urdf_path=str(urdf_copy)))
    q = np.zeros(info.dof)
    np.testing.assert_allclose(copied.dyn.gravity(q), ref.dyn.gravity(q), atol=1e-12)
