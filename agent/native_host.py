#!/usr/bin/env python3
"""Citation Nexus — Native Messaging Host.

A small command-line binary that Chrome invokes when the extension calls
``chrome.runtime.sendNativeMessage``. It speaks Chrome's Native Messaging
framing (4-byte little-endian length prefix + UTF-8 JSON message) over
stdin/stdout and forwards requests to the local HTTP bridge.

Why this exists:
- Lets a CLI agent (Hermes, Claude, plain `cat | nexus`) trigger
  extension actions without the bridge being network-reachable from outside.
- The extension owns the message format; we are a transparent forwarder.

Setup (informative — actual install instructions in docs/AGENT.md):
- Build a single-file binary with `pyinstaller` or run with the system
  Python (`#!/usr/bin/env python3`).
- Register the path in a Native Messaging manifest installed at
  `~/.config/google-chrome/NativeMessagingHosts/com.nexus.host.json`.

Protocol (request):
    {"action": "import", "request": ImportRequest}
    {"action": "scan", "text": "..."}
    {"action": "patterns"}

Protocol (response):
    {"ok": true, "data": ...}  on success
    {"ok": false, "error": "..."}  on failure
"""

from __future__ import annotations

import json
import os
import struct
import sys
from pathlib import Path
from typing import Any

import httpx

BRIDGE_URL = os.environ.get("NEXUS_BRIDGE_URL", "http://127.0.0.1:3002")
LOG_PATH = Path(os.environ.get("NEXUS_HOST_LOG", Path.home() / ".local/log/nexus-host.log"))


def log(msg: str) -> None:
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except OSError:
        pass


def send_message(payload: dict[str, Any]) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(body)))
    sys.stdout.buffer.write(body)
    sys.stdout.buffer.flush()


def recv_message() -> dict[str, Any]:
    raw_len = sys.stdin.buffer.read(4)
    if not raw_len:
        sys.exit(0)
    (length,) = struct.unpack("<I", raw_len)
    body = sys.stdin.buffer.read(length).decode("utf-8")
    return json.loads(body)


def dispatch(msg: dict[str, Any]) -> dict[str, Any]:
    action = msg.get("action")
    if action == "patterns":
        try:
            r = httpx.get(f"{BRIDGE_URL}/patterns", timeout=5.0)
            return {"ok": r.status_code == 200, "data": r.json()}
        except httpx.HTTPError as e:
            return {"ok": False, "error": f"bridge: {e}"}
    if action == "import":
        try:
            r = httpx.post(f"{BRIDGE_URL}/import", json=msg.get("request", {}), timeout=10.0)
            return {"ok": r.status_code == 200, "data": r.json()}
        except httpx.HTTPError as e:
            return {"ok": False, "error": f"bridge: {e}"}
    if action == "health":
        try:
            r = httpx.get(f"{BRIDGE_URL}/health", timeout=5.0)
            return {"ok": r.status_code == 200, "data": r.json()}
        except httpx.HTTPError as e:
            return {"ok": False, "error": f"bridge: {e}"}
    return {"ok": False, "error": f"unknown action: {action}"}


def main() -> None:
    log("host started")
    while True:
        try:
            msg = recv_message()
        except json.JSONDecodeError as e:
            send_message({"ok": False, "error": f"bad json: {e}"})
            continue
        log(f"received: {msg}")
        result = dispatch(msg)
        send_message(result)


if __name__ == "__main__":
    main()
