#!/usr/bin/env python3
"""Copy the robot visual assets the frontend needs from the pinned ufactory_genesis checkout.

Copies bare arm URDFs, pre-composes every supported (arm, end_effector) GLB assembly via
``ufactory.robots.assembly`` into ``urdf/composed/<key>__<ee>__glb.urdf``, and copies every
GLB referenced by a ``<visual>`` element (including cross-robot meshes such as xArm5/7 -> xArm6
and end-effector meshes). Collision meshes are not copied. Fails if a visual mesh referenced by
a URDF is missing.
Output: apps/desktop/public/robot-assets/urdf/ (git-ignored, regenerated at build time).
Attribution: see NOTICE.
"""
from __future__ import annotations

import argparse
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UFG_DEFAULT = ROOT / "third_party" / "ufactory_genesis"
SRC = UFG_DEFAULT / "assets" / "urdf"
DST = ROOT / "apps" / "desktop" / "public" / "robot-assets" / "urdf"

SUPPORTED_KEYS: tuple[str, ...] = ("uf850", "xarm5_1305", "xarm6_1305", "xarm7_1305", "lite6")


def _visual_mesh_paths(root_elem: ET.Element, base_dir: Path) -> list[Path]:
    out = []
    for vis in root_elem.iter("visual"):
        for mesh in vis.iter("mesh"):
            fn = mesh.get("filename", "")
            if fn and "://" not in fn:
                out.append((base_dir / fn).resolve())
    return out


def visual_meshes(urdf: Path) -> list[Path]:
    return _visual_mesh_paths(ET.parse(urdf).getroot(), urdf.parent)


def _import_assembly(ufg_root: Path):
    ufg_str = str(ufg_root.resolve())
    if ufg_str not in sys.path:
        sys.path.insert(0, ufg_str)
    from ufactory.robots.assembly import build_assembly_tree, serialize_assembly, supported_end_effectors

    return build_assembly_tree, serialize_assembly, supported_end_effectors


def sync(src: Path = SRC, dst: Path = DST) -> tuple[int, int]:
    src_r = src.resolve()
    ufg_root = src_r.parents[1]
    build_assembly_tree, serialize_assembly, supported_end_effectors = _import_assembly(ufg_root)

    if dst.exists():
        shutil.rmtree(dst)
    files: set[Path] = set()
    composed_outputs: list[tuple[Path, bytes]] = []
    missing: list[str] = []

    for urdf in src_r.rglob("*.urdf"):
        files.add(urdf.resolve())
        if "visual" not in urdf.name:
            continue
        for m in visual_meshes(urdf):
            if m.suffix.lower() not in {".glb", ".stl"}:
                continue
            if m.is_file():
                files.add(m)
            else:
                missing.append(f"{urdf.relative_to(src_r)} -> {m}")

    # Pre-compose every supported arm + end-effector visual URDF (upstream v0.3.8+ removed static combos).
    composed_virtual_dir = src_r / "composed"
    for key in SUPPORTED_KEYS:
        for ee in supported_end_effectors(key, root=ufg_root):
            tree = build_assembly_tree(key, ee, visual="glb", root=ufg_root, out_dir=composed_virtual_dir)
            data = serialize_assembly(tree)
            out_rel = Path("composed") / f"{key}__{ee}__glb.urdf"
            composed_outputs.append((dst / out_rel, data))
            for m in _visual_mesh_paths(tree, composed_virtual_dir):
                if m.suffix.lower() not in {".glb", ".stl"}:
                    continue
                if m.is_file():
                    files.add(m)
                else:
                    missing.append(f"{out_rel} -> {m}")

    for f in src_r.rglob("visual_glb/*.glb"):
        files.add(f.resolve())

    if missing:
        raise FileNotFoundError("visual meshes missing upstream:\n  " + "\n  ".join(missing))

    size = 0
    for f in sorted(files):
        out = dst / f.relative_to(src_r)
        out.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, out)
        size += f.stat().st_size

    for out, data in composed_outputs:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        size += len(data)

    notice = ufg_root / "NOTICE"
    if notice.is_file():
        shutil.copy2(notice, dst.parent / "NOTICE.ufactory_genesis")
    return len(files) + len(composed_outputs), size


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dest", type=Path, default=DST)
    a = ap.parse_args()
    if not SRC.is_dir():
        print(f"missing {SRC}; run scripts/fetch_ufg.py first", file=sys.stderr)
        return 1
    n, size = sync(SRC, a.dest)
    print(f"synced {n} files ({size / 1e6:.1f} MB) -> {a.dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
