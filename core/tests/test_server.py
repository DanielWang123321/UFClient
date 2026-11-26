"""End-to-end over a real WebSocket: stdout handshake, token auth, JSON-RPC, and real.state push."""

from __future__ import annotations

import asyncio
import contextlib
import json
import socket
import subprocess
import sys

import websockets
from websockets.sync.client import connect

from ufclient_core import server
from ufclient_core.backend.real_xarm import MODE_POSITION, STATE_READY, STATE_STOP, RealXArmController
from ufclient_core.session import SessionStore


class _FakeArm:
    def __init__(self, ip: str) -> None:
        self.ip = ip
        self.axis = 6
        self.device_type = 6
        self.connected = True
        self.error_code = 0
        self.warn_code = 0
        self.state = STATE_READY
        self.mode = MODE_POSITION
        self.version = "2.8.1"
        self.sn = "XI1305060001"
        self.is_simulation_robot = False
        self.angles = [10.0, -20.0, -30.0, 0.0, 50.0, 15.0, 0.0]
        self.position = [320.0, 10.0, 250.0, 180.0, 0.0, 0.0]
        self.tcp_offset = [0.0, 0.0, 173.5, 0.0, 0.0, 0.0]
        self.tcp_load = [1.0, [0.0, 0.0, 30.0]]
        self.calls: list[tuple[str, tuple]] = []

    def set_state(self, state: int = 0) -> int:
        self.calls.append(("set_state", (state,)))
        self.state = STATE_READY if state == 0 else state
        return 0

    def disconnect(self) -> None:
        self.calls.append(("disconnect", ()))
        self.connected = False


def test_sidecar_handshake_and_rpc():
    p = subprocess.Popen([sys.executable, "-m", "ufclient_core"], stdout=subprocess.PIPE, text=True)
    try:
        first_line = p.stdout.readline()
        assert "SDK_VERSION" not in first_line
        hs = json.loads(first_line)
        assert isinstance(hs["port"], int) and len(hs["token"]) == 32
        with connect(f"ws://127.0.0.1:{hs['port']}") as ws:
            ws.send(json.dumps({"jsonrpc": "2.0", "id": 1, "method": "ping"}))
            assert json.loads(ws.recv())["error"]["code"] == 1001
            ws.send(json.dumps({"jsonrpc": "2.0", "id": 2, "method": "system.hello", "params": {"token": hs["token"]}}))
            hello = json.loads(ws.recv())["result"]
            assert hello["api_version"] == "1.0"
            assert "real" in hello["capabilities"]
            ws.send(json.dumps({"jsonrpc": "2.0", "id": 3, "method": "ping"}))
            assert json.loads(ws.recv())["result"] == "pong"
            ws.send(json.dumps({"jsonrpc": "2.0", "id": 4, "method": "system.shutdown"}))
            assert json.loads(ws.recv())["result"] == {"ok": True}
        assert p.wait(timeout=10) == 0
    finally:
        p.kill()


def test_real_state_push_and_disconnect_cleanup():
    arm = _FakeArm("192.168.1.60")
    real = RealXArmController(arm_factory=lambda _ip: arm, connect_wait_s=0.05, mode_wait_s=0.05)
    store = SessionStore(real=real)

    async def scenario() -> None:
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]

        srv_task = asyncio.create_task(server.run(host="127.0.0.1", port=port, token="t" * 32, store=store))
        await asyncio.sleep(0.15)
        try:
            async with websockets.connect(f"ws://127.0.0.1:{port}") as ws:
                hello_req = {"jsonrpc": "2.0", "id": 1, "method": "system.hello", "params": {"token": "t" * 32}}
                await ws.send(json.dumps(hello_req))
                assert "result" in json.loads(await ws.recv())

                conn_req = {"jsonrpc": "2.0", "id": 2, "method": "real.connect", "params": {"ip": "192.168.1.60"}}
                await ws.send(json.dumps(conn_req))
                conn_resp = None
                push_note = None
                for _ in range(10):
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=1.0))
                    if msg.get("id") == 2:
                        conn_resp = msg["result"]
                    elif msg.get("method") == "real.state":
                        push_note = msg["params"]
                    if conn_resp is not None and push_note is not None:
                        break
                assert conn_resp is not None and conn_resp["robot_key"] == "xarm6_1305"
                assert push_note is not None and push_note["connected"] is True and len(push_note["q_deg"]) == 6
            # Closing the WS client must stop & disconnect the real arm cleanly
            await asyncio.sleep(0.15)
            assert arm.connected is False
            assert ("set_state", (STATE_STOP,)) in arm.calls
        finally:
            srv_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await srv_task

    asyncio.run(scenario())
