"""RobotCatalog backed by ufactory_genesis (read-only use of upstream modules).

Only ``ufactory.robots``, ``ufactory.config`` and ``ufactory.kinematics.tcp_offset`` are
imported, never torch/genesis. Maximum joint torques (``effort_limits_nm``, UFACTORY joint
parameters: https://docs.supportarticle.ufactory.cc/zhHans/support_articles/hardware/ufactory-joint-parameters.html)
are read at runtime from the upstream runtime config and are never hard-coded in UFClient
(design doc §9).
"""

from __future__ import annotations

import subprocess
from importlib import metadata
from pathlib import Path

from ufactory.config.assets import RepositoryAssetStore
from ufactory.config.loader import load_runtime_config
from ufactory.robots.assembly import build_assembly_tree, serialize_assembly, supported_end_effectors
from ufactory.robots.paths import robot_urdf
from ufactory.robots.registry import PROJECT_ROOT, ROBOT_PROFILES, get_robot_profile, joint_names

from .interfaces import RobotInfo

#: Models supported by UFClient (doc §1): xArm only in its _1305 revision, plus UF850 and Lite6.
SUPPORTED_KEYS: tuple[str, ...] = ("uf850", "xarm5_1305", "xarm6_1305", "xarm7_1305", "lite6")

#: TCP frames defined in upstream end-effector URDFs (searched in order after composing the arm + tool).
_URDF_TCP_FRAMES: tuple[str, ...] = (
    "link_tcp",
    "vacuum_tcp",
    "bio_gripper_g2_tcp_link",
    "robotiq_2f_85_tcp_link",
    "robotiq_2f_140_tcp_link",
)


def asset_root() -> Path:
    return Path(PROJECT_ROOT)


def composed_visual_urdf_name(key: str, end_effector: str) -> str:
    return f"{key}__{end_effector}__glb.urdf"


class UfgCatalog:
    def __init__(self) -> None:
        self._store = RepositoryAssetStore(root=asset_root())
        self._cache: dict[tuple[str, str], RobotInfo] = {}

    def list_keys(self) -> list[str]:
        return [k for k in SUPPORTED_KEYS if k in ROBOT_PROFILES]

    def end_effectors(self, key: str) -> tuple[str, ...]:
        return ("none", *supported_end_effectors(key, root=asset_root()))

    def info(self, key: str, end_effector: str = "none") -> RobotInfo:
        if (key, end_effector) not in self._cache:
            self._cache[(key, end_effector)] = self._info(key, end_effector)
        return self._cache[(key, end_effector)]

    def _info(self, key: str, end_effector: str) -> RobotInfo:
        if key not in self.list_keys():
            raise KeyError(key)
        profile = get_robot_profile(key)
        ees = self.end_effectors(key)
        if end_effector not in ees:
            raise ValueError(f"end effector {end_effector!r} not available for {key}")
        if end_effector == "none":
            visual_relpath = f"urdf/{profile.robot_name}/{profile.visual_glb_urdf}"
        else:
            visual_relpath = f"urdf/composed/{composed_visual_urdf_name(key, end_effector)}"
        cfg = load_runtime_config(key, asset_store=self._store)
        home_q = getattr(cfg.arm, "home_qpos_rad", None)
        home_q_rad = tuple(float(x) for x in home_q) if home_q is not None else (0.0,) * profile.dof
        default_tcp, default_tcp_src = _default_tcp(key, end_effector, profile.ee_link)
        return RobotInfo(
            key=key,
            robot_name=profile.robot_name,
            dof=profile.dof,
            ee_link=profile.ee_link,
            joint_names=tuple(joint_names(profile)),
            urdf_path=robot_urdf(key),  # pure arm URDF: payload is modelled separately (doc §6.1)
            visual_urdf_relpath=visual_relpath,
            effort_limits_nm=tuple(float(x) for x in cfg.arm.effort_limits_nm),
            home_q_rad=home_q_rad,
            end_effectors=ees,
            end_effector=end_effector,
            default_tcp_offset=default_tcp,
            default_tcp_source=default_tcp_src,
        )

    def versions(self) -> dict[str, str]:
        return {"ufactory_genesis_version": _ufg_version(), "ufactory_genesis_commit": _ufg_commit()}


def _default_tcp(key: str, end_effector: str, ee_link: str) -> tuple[tuple[float, ...], str]:
    """Default TCP offset of an end effector read directly from the upstream composed URDF.

    Composes the arm + end-effector tree in memory (never writes to read-only bundle dirs)
    and parses it with Pinocchio to express the tool TCP frame in the flange frame.
    ``gripper.tool_tip_offset_z_m`` (runtime config) is a grasp-planning offset, not the TCP,
    and is deliberately not used.
    """
    if end_effector == "none":
        return (0.0,) * 6, "none"

    import numpy as np
    import pinocchio as pin
    from ufactory.kinematics.tcp_offset import matrix_to_rpy

    root = asset_root()
    tree = build_assembly_tree(
        key,
        end_effector,
        visual="glb",
        root=root,
        out_dir=root / "assets" / "urdf" / "composed",
    )
    xml_str = serialize_assembly(tree).decode("utf-8")
    model = pin.buildModelFromXML(xml_str)
    data = model.createData()
    pin.framesForwardKinematics(model, data, pin.neutral(model))
    urdf_name = composed_visual_urdf_name(key, end_effector)
    for name in _URDF_TCP_FRAMES:
        if model.existFrame(name):
            T = data.oMf[model.getFrameId(ee_link)].actInv(data.oMf[model.getFrameId(name)])
            xyz = [round(float(v) * 1000.0, 3) + 0.0 for v in T.translation]
            rpy = [round(float(np.degrees(a)), 3) + 0.0 for a in matrix_to_rpy(T.rotation)]
            joint = next(
                (
                    j.get("name") or name
                    for j in tree.iter("joint")
                    if j.find("child") is not None and j.find("child").get("link") == name
                ),
                name,
            )
            return tuple(xyz + rpy), f"urdf:{urdf_name}#{joint}"
    return (0.0,) * 6, "none"


def _ufg_version() -> str:
    try:
        return metadata.version("genesis-ufactory")
    except metadata.PackageNotFoundError:
        f = asset_root() / "UFG_VERSION"
        return f.read_text().strip() if f.is_file() else "unknown"


def _ufg_commit() -> str:
    f = asset_root() / "UFG_COMMIT"  # written by the PyInstaller build
    if f.is_file():
        return f.read_text().strip()[:7]
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short=7", "HEAD"],
            cwd=asset_root(),
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return "unknown"
