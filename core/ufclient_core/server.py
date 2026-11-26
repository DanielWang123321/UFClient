"""WebSocket server bound to 127.0.0.1 on a random port.

Handshake: the first stdout line is ``{"port": <int>, "token": "<hex>"}``; the Tauri shell
reads it and forwards it to the frontend, which connects directly over WebSocket.
Post-auth RPC requests run concurrently on worker threads so ``real.stop`` is never queued
behind slow SDK calls, while connected real robots push ``real.state`` notifications at 15 Hz.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import secrets
import sys

from websockets.asyncio.server import ServerConnection, serve

from .rpc import Connection
from .session import SessionStore

REAL_PUSH_HZ = 15.0


async def run(
    host: str = "127.0.0.1",
    port: int = 0,
    token: str | None = None,
    store: SessionStore | None = None,
) -> None:
    token = token or secrets.token_hex(16)
    store = store or SessionStore()
    stop = asyncio.Event()

    async def handler(ws: ServerConnection) -> None:
        conn = Connection(token, store, on_shutdown=stop.set)
        send_lock = asyncio.Lock()
        in_flight: set[asyncio.Task[None]] = set()

        async def send_text(payload: str) -> None:
            async with send_lock:
                await ws.send(payload)

        async def push_real_state() -> None:
            period = 1.0 / REAL_PUSH_HZ
            was_connected = False
            while not stop.is_set():
                await asyncio.sleep(period)
                if not conn.authed:
                    continue
                connected = store.real.is_connected
                if not connected and not was_connected:
                    continue
                was_connected = connected
                snap = await asyncio.to_thread(store.real.snapshot)
                note = json.dumps({"jsonrpc": "2.0", "method": "real.state", "params": snap})
                try:
                    await send_text(note)
                except Exception:
                    return

        async def dispatch(text: str) -> None:
            resp = await asyncio.to_thread(conn.handle_text, text)
            if resp is not None:
                with contextlib.suppress(Exception):
                    await send_text(resp)

        push_task = asyncio.create_task(push_real_state())
        try:
            async for msg in ws:
                text = msg if isinstance(msg, str) else msg.decode("utf-8", "replace")
                if not conn.authed:
                    # Keep initial system.hello ordered before concurrent post-auth calls.
                    resp = await asyncio.to_thread(conn.handle_text, text)
                    if resp is not None:
                        await send_text(resp)
                    continue
                task = asyncio.create_task(dispatch(text))
                in_flight.add(task)
                task.add_done_callback(in_flight.discard)
        finally:
            push_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await push_task
            if in_flight:
                await asyncio.gather(*in_flight, return_exceptions=True)
            if store.real.is_connected:
                await asyncio.to_thread(store.real.emergency_cleanup)

    try:
        async with serve(handler, host, port, max_size=8 * 1024 * 1024) as server:
            bound = server.sockets[0].getsockname()[1]
            sys.stdout.write(json.dumps({"port": bound, "token": token}) + "\n")
            sys.stdout.flush()
            await stop.wait()
    finally:
        store.real.emergency_cleanup()
