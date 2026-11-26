#!/usr/bin/env python3
"""Start UFClient backend (ufclient_core) and frontend (Vite) in one command.

Injects the backend's random {port, token} handshake into Vite via
``VITE_UFCLIENT_PORT`` and ``VITE_UFCLIENT_TOKEN`` so opening
``http://localhost:<port>`` in a browser connects immediately.
"""

from __future__ import annotations

import argparse
import json
import os
import queue
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from collections.abc import Mapping
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CORE_DIR = ROOT / "core"
UFG_DIR = ROOT / "third_party" / "ufactory_genesis"
DESKTOP_DIR = ROOT / "apps" / "desktop"
ROBOT_ASSETS_URDF_DIR = DESKTOP_DIR / "public" / "robot-assets" / "urdf"
DEFAULT_FRONTEND_PORT = 1420
REQUIRED_BACKEND_IMPORTS = ("pinocchio", "websockets", "yaml", "packaging")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        prog="dev.py",
        description="Launch UFClient Python WebSocket backend and Vue/Vite dev frontend together.",
    )
    ap.add_argument("--port", type=int, default=DEFAULT_FRONTEND_PORT, help="Frontend Vite port (default: 1420)")
    ap.add_argument("--backend-port", type=int, default=0, help="Backend WebSocket port (0 = random free port)")
    ap.add_argument("--token", default=None, help="Optional fixed WebSocket auth token")
    ap.add_argument("--python", type=Path, default=None, help="Python executable for ufclient_core")
    ap.add_argument(
        "--sync-assets",
        action="store_true",
        help="Force re-running scripts/sync_assets.py before starting",
    )
    ap.add_argument("--open", action="store_true", help="Open the browser automatically once ready")
    args = ap.parse_args(argv)
    if not (1 <= args.port <= 65535):
        ap.error("--port must be between 1 and 65535")
    if not (0 <= args.backend_port <= 65535):
        ap.error("--backend-port must be between 0 and 65535")
    return args


def build_backend_env(base_env: Mapping[str, str] | None = None) -> dict[str, str]:
    env = dict(os.environ if base_env is None else base_env)
    extra = f"{CORE_DIR}{os.pathsep}{UFG_DIR}"
    existing = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{extra}{os.pathsep}{existing}" if existing else extra
    env["PYTHONUNBUFFERED"] = "1"
    return env


def has_backend_deps(py: Path) -> bool:
    if not py.is_file() or not os.access(py, os.X_OK):
        return False
    check_code = f"import {', '.join(REQUIRED_BACKEND_IMPORTS)}"
    try:
        res = subprocess.run(
            [str(py), "-c", check_code],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return res.returncode == 0


def _discover_conda_pythons() -> list[Path]:
    conda_cmd = shutil.which("conda")
    if not conda_cmd:
        for fallback in (
            Path("/opt/miniconda3/condabin/conda"),
            Path("/opt/conda/condabin/conda"),
            Path.home() / "miniconda3/bin/conda",
            Path.home() / "anaconda3/bin/conda",
        ):
            if fallback.is_file():
                conda_cmd = str(fallback)
                break
    if not conda_cmd:
        return []
    try:
        res = subprocess.run(
            [conda_cmd, "info", "--envs", "--json"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        if res.returncode != 0:
            return []
        envs = json.loads(res.stdout).get("envs", [])
    except (OSError, subprocess.SubprocessError, ValueError):
        return []

    def sort_key(env_path: str) -> tuple[int, str]:
        name = Path(env_path).name
        if name == "py313":
            return (0, env_path)
        if name == "py312":
            return (1, env_path)
        return (2, env_path)

    return [Path(p) / "bin" / "python" for p in sorted(envs, key=sort_key)]


def resolve_backend_python(explicit: Path | None = None) -> Path:
    override = explicit or (Path(p) if (p := os.environ.get("UFCLIENT_PYTHON") or os.environ.get("UGCLIENT_PYTHON")) else None)
    if override is not None:
        candidate = override.expanduser()
        if not has_backend_deps(candidate):
            raise RuntimeError(
                f"Specified Python interpreter {candidate} is missing required backend dependencies "
                f"({', '.join(REQUIRED_BACKEND_IMPORTS)})."
            )
        return candidate

    raw_candidates: list[Path] = []
    if conda_prefix := os.environ.get("CONDA_PREFIX"):
        raw_candidates.append(Path(conda_prefix) / "bin" / "python")
    if venv := os.environ.get("VIRTUAL_ENV"):
        raw_candidates.append(Path(venv) / "bin" / "python")
    raw_candidates.append(Path(sys.executable))
    raw_candidates.append(ROOT / ".venv" / "bin" / "python")
    raw_candidates.extend(
        [
            Path("/opt/conda_envs/py313/bin/python"),
            Path.home() / "miniconda3/envs/py313/bin/python",
            Path.home() / "anaconda3/envs/py313/bin/python",
        ]
    )
    raw_candidates.extend(_discover_conda_pythons())
    raw_candidates.append(Path("/opt/conda_envs/py312/bin/python"))
    for cmd in ("python3", "python"):
        if found := shutil.which(cmd):
            raw_candidates.append(Path(found))

    seen: set[str] = set()
    for cand in raw_candidates:
        key = os.path.abspath(str(cand.expanduser()))
        if key in seen:
            continue
        seen.add(key)
        if has_backend_deps(Path(key)):
            return Path(key)

    raise RuntimeError(
        "Could not find a Python interpreter with backend dependencies "
        f"({', '.join(REQUIRED_BACKEND_IMPORTS)}). Activate conda env 'py313' or pass --python /path/to/python."
    )


def _semver_key(version_dir: Path) -> tuple[int, ...]:
    nums = [int(n) for n in re.findall(r"\d+", version_dir.name)]
    return tuple(nums)


def resolve_pnpm() -> Path:
    if found := shutil.which("pnpm"):
        return Path(found)

    nvm_node_dir = Path.home() / ".nvm" / "versions" / "node"
    if nvm_node_dir.is_dir():
        versions = sorted((p for p in nvm_node_dir.iterdir() if p.is_dir()), key=_semver_key, reverse=True)
        for ver in versions:
            candidate = ver / "bin" / "pnpm"
            if candidate.is_file() and os.access(candidate, os.X_OK):
                return candidate

    local_pnpm = Path.home() / ".local" / "share" / "pnpm" / "pnpm"
    if local_pnpm.is_file() and os.access(local_pnpm, os.X_OK):
        return local_pnpm

    raise RuntimeError("Could not find 'pnpm' on PATH or under ~/.nvm/versions/node/*/bin.")


def build_frontend_env(pnpm_bin: Path, base_env: Mapping[str, str] | None = None) -> dict[str, str]:
    env = dict(os.environ if base_env is None else base_env)
    bin_dir = str(pnpm_bin.parent)
    path_parts = env.get("PATH", "").split(os.pathsep) if env.get("PATH") else []
    if not path_parts or path_parts[0] != bin_dir:
        env["PATH"] = os.pathsep.join([bin_dir, *[p for p in path_parts if p]])
    return env


def is_port_in_use(port: int) -> bool:
    for host in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((host, port), timeout=0.3):
                return True
        except OSError:
            continue
    return False


def ensure_prerequisites(
    backend_py: Path,
    backend_env: Mapping[str, str],
    pnpm_bin: Path,
    frontend_env: Mapping[str, str],
    force_sync_assets: bool,
) -> None:
    if not (UFG_DIR / "ufactory").is_dir():
        print("[dev] Fetching pinned ufactory_genesis into third_party/...", flush=True)
        subprocess.run([str(backend_py), str(ROOT / "scripts" / "fetch_ufg.py")], cwd=ROOT, check=True)

    assets_present = ROBOT_ASSETS_URDF_DIR.is_dir() and any(ROBOT_ASSETS_URDF_DIR.rglob("*.urdf"))
    if force_sync_assets or not assets_present:
        print("[dev] Syncing robot visual assets to apps/desktop/public/robot-assets...", flush=True)
        subprocess.run(
            [str(backend_py), str(ROOT / "scripts" / "sync_assets.py")],
            cwd=ROOT,
            env=dict(backend_env),
            check=True,
        )

    if not (DESKTOP_DIR / "node_modules").is_dir():
        print("[dev] Installing frontend dependencies via pnpm install...", flush=True)
        subprocess.run([str(pnpm_bin), "install"], cwd=DESKTOP_DIR, env=dict(frontend_env), check=True)


def start_backend(
    backend_py: Path,
    backend_env: Mapping[str, str],
    backend_port: int,
    token: str | None,
) -> tuple[subprocess.Popen[str], int, str]:
    cmd = [str(backend_py), "-u", "-m", "ufclient_core", "--host", "127.0.0.1", "--port", str(backend_port)]
    if token:
        cmd.extend(["--token", token])

    proc = subprocess.Popen(
        cmd,
        cwd=ROOT,
        env=dict(backend_env),
        stdout=subprocess.PIPE,
        stderr=None,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    assert proc.stdout is not None
    first_line_q: queue.Queue[str | None] = queue.Queue()

    def _drain_stdout() -> None:
        assert proc.stdout is not None
        got_handshake = False
        try:
            for raw in proc.stdout:
                line = raw.rstrip("\r\n")
                if not got_handshake:
                    if not line.strip():
                        continue
                    got_handshake = True
                    first_line_q.put(line)
                else:
                    print(f"[backend] {line}", flush=True)
        finally:
            if not got_handshake:
                first_line_q.put(None)

    threading.Thread(target=_drain_stdout, name="backend-stdout", daemon=True).start()

    deadline = time.monotonic() + 20.0
    handshake_line: str | None = None
    while time.monotonic() < deadline:
        try:
            handshake_line = first_line_q.get(timeout=0.1)
            break
        except queue.Empty:
            if proc.poll() is not None:
                raise RuntimeError(f"Backend exited with code {proc.returncode} before printing handshake.") from None

    if not handshake_line:
        terminate_process_group(proc, graceful_sig=signal.SIGINT)
        raise RuntimeError("Backend did not produce a valid JSON handshake within 20s.")

    try:
        hs = json.loads(handshake_line)
        ws_port = hs["port"]
        ws_token = hs["token"]
    except (ValueError, KeyError, TypeError) as err:
        terminate_process_group(proc, graceful_sig=signal.SIGINT)
        raise RuntimeError(f"Invalid backend handshake line {handshake_line!r}: {err}") from err

    if not (isinstance(ws_port, int) and not isinstance(ws_port, bool) and ws_port > 0):
        terminate_process_group(proc, graceful_sig=signal.SIGINT)
        raise RuntimeError(f"Invalid backend handshake port: {ws_port!r}")
    if not (isinstance(ws_token, str) and ws_token):
        terminate_process_group(proc, graceful_sig=signal.SIGINT)
        raise RuntimeError("Invalid backend handshake token.")

    return proc, ws_port, ws_token


def start_frontend(
    pnpm_bin: Path,
    frontend_env: Mapping[str, str],
    port: int,
    backend_port: int,
    backend_token: str,
) -> subprocess.Popen[bytes]:
    env = dict(frontend_env)
    env["VITE_UFCLIENT_PORT"] = str(backend_port)
    env["VITE_UFCLIENT_TOKEN"] = backend_token

    cmd = [str(pnpm_bin), "run", "dev"]
    if port != DEFAULT_FRONTEND_PORT:
        cmd.extend(["--port", str(port)])

    return subprocess.Popen(
        cmd,
        cwd=DESKTOP_DIR,
        env=env,
        start_new_session=True,
    )


def wait_for_frontend(
    url: str,
    frontend: subprocess.Popen[bytes],
    backend: subprocess.Popen[str],
    timeout: float = 30.0,
) -> None:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if backend.poll() is not None:
            raise RuntimeError(f"Backend exited prematurely with code {backend.returncode}")
        if frontend.poll() is not None:
            raise RuntimeError(f"Frontend exited prematurely with code {frontend.returncode}")
        try:
            with opener.open(url, timeout=1.0) as resp:
                if 200 <= resp.status < 500:
                    return
        except urllib.error.HTTPError as err:
            if 200 <= err.code < 500:
                return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.2)
    raise RuntimeError(f"Timed out waiting for frontend at {url} after {timeout:.0f}s")


def terminate_process_group(
    proc: subprocess.Popen[Any] | None,
    *,
    graceful_sig: int,
    timeout: float = 5.0,
) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, graceful_sig)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=timeout)
        return
    except subprocess.TimeoutExpired:
        pass

    if graceful_sig == signal.SIGINT:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            proc.wait(timeout=2.0)
            return
        except subprocess.TimeoutExpired:
            pass

    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        return
    try:
        proc.wait(timeout=2.0)
    except subprocess.TimeoutExpired:
        pass


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if is_port_in_use(args.port):
        print(
            f"[dev] Error: port {args.port} is already in use. Close the existing server or pass --port <PORT>.",
            file=sys.stderr,
        )
        return 1
    if args.backend_port and is_port_in_use(args.backend_port):
        print(
            f"[dev] Error: backend port {args.backend_port} is already in use. Pass another --backend-port.",
            file=sys.stderr,
        )
        return 1

    stop_event = threading.Event()

    def _on_signal(_signum: int, _frame: Any) -> None:
        stop_event.set()

    signal.signal(signal.SIGINT, _on_signal)
    signal.signal(signal.SIGTERM, _on_signal)

    backend: subprocess.Popen[str] | None = None
    frontend: subprocess.Popen[bytes] | None = None
    exit_code = 0

    try:
        backend_py = resolve_backend_python(args.python)
        pnpm_bin = resolve_pnpm()
        backend_env = build_backend_env()
        frontend_env = build_frontend_env(pnpm_bin)

        ensure_prerequisites(backend_py, backend_env, pnpm_bin, frontend_env, args.sync_assets)
        backend, ws_port, ws_token = start_backend(backend_py, backend_env, args.backend_port, args.token)
        frontend = start_frontend(pnpm_bin, frontend_env, args.port, ws_port, ws_token)

        url = f"http://localhost:{args.port}"
        wait_for_frontend(url, frontend, backend)

        print(
            "\n"
            "============================================================\n"
            "UFClient Dev Server Ready\n"
            f"  Browser URL : {url}\n"
            f"  Backend WS  : ws://127.0.0.1:{ws_port} (auto-injected)\n"
            f"  Backend Py  : {backend_py}\n"
            "Press Ctrl+C to stop both frontend and backend.\n"
            "============================================================",
            flush=True,
        )
        if args.open:
            webbrowser.open(url)

        while not stop_event.wait(0.2):
            if backend.poll() is not None:
                print(f"[dev] Backend exited unexpectedly with code {backend.returncode}.", file=sys.stderr)
                exit_code = backend.returncode or 1
                break
            if frontend.poll() is not None:
                print(f"[dev] Frontend exited unexpectedly with code {frontend.returncode}.", file=sys.stderr)
                exit_code = frontend.returncode or 1
                break
    except KeyboardInterrupt:
        pass
    except Exception as err:
        print(f"[dev] Error: {err}", file=sys.stderr)
        exit_code = 1
    finally:
        terminate_process_group(frontend, graceful_sig=signal.SIGTERM, timeout=5.0)
        terminate_process_group(backend, graceful_sig=signal.SIGINT, timeout=3.0)

    return exit_code


if __name__ == "__main__":
    sys.exit(main())
