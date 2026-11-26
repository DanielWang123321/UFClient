"""R1 guard: the sidecar import chain must never pull torch or genesis (design doc §9),
and xarm-python-sdk must be lazily imported so it cannot print SDK_VERSION before stdout handshake."""

import subprocess
import sys


def test_no_torch_or_genesis():
    code = (
        "import sys, ufclient_core.rpc, ufclient_core.server;"
        "from ufclient_core.backend import factory, real_xarm;"
        "factory.catalog().info('uf850');"
        "bad=[m for m in sys.modules if m.split('.')[0] in ('torch','genesis','xarm')];"
        "print(bad); sys.exit(1 if bad else 0)"
    )
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=False)
    assert r.returncode == 0, r.stdout + r.stderr
