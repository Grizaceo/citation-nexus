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

# Default vault root for downloaded papers. Mirrors the bridge's
# `DEFAULT_VAULT_ROOT` in bridge/nexus_bridge/server.py but adds
# a `papers/` subdirectory so the actual paper files live next
# to (but distinct from) the import metadata files.
DEFAULT_VAULT_ROOT = Path(
    os.environ.get("NEXUS_VAULT_ROOT", Path.home() / ".local/share/nexus/vault")
).expanduser()
PAPERS_ROOT = DEFAULT_VAULT_ROOT / "papers"


def log(msg: str) -> None:
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as f:
            f.write(msg + "\n")
    except OSError:
        pass


def send_message(payload: dict[str, Any]) -> None:
    body = json.dumps(payload).encode("utf-8")
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
    if action == "scan":
        # Bridge /scan is intentionally 501 ("scan runs in the
        # extension"); the native host is just a forwarder. We pass
        # the bridge's detail through as the error string so the
        # caller learns the real reason, instead of getting the
        # misleading "unknown action: scan" we used to return when
        # this branch was missing.
        try:
            r = httpx.post(f"{BRIDGE_URL}/scan", json=msg.get("request", {}), timeout=10.0)
            if r.status_code == 200:
                return {"ok": True, "data": r.json()}
            detail = r.json().get("detail", f"HTTP {r.status_code}")
            return {"ok": False, "error": f"bridge: {detail}"}
        except httpx.HTTPError as e:
            return {"ok": False, "error": f"bridge: {e}"}
    if action == "download":
        # New: fetch the URL and write to the local vault under
        # papers/<category>/<filename>.<format>. Returns the absolute
        # path of the saved file plus size, so the popup can show
        # "Saved to ~/.local/share/nexus/vault/papers/arxiv/2401.01234.pdf".
        return _do_download(msg.get("request", {}))
    return {"ok": False, "error": f"unknown action: {action}"}


def _do_download(req: dict[str, Any]) -> dict[str, Any]:
    """Fetch a URL and save the response body to the vault.

    Request shape (matches DownloadInfo from the TS downloader):
        { url, category, filename, format }
    where `format` is the expected extension (the response's
    Content-Type may differ; we keep the caller's format and let
    the user rename later if needed).

    Returns:
        { ok: true, path, size, format, contentType }  on success
        { ok: false, error }                           on failure
    """
    url = req.get("url")
    category = req.get("category")
    filename = req.get("filename")
    fmt = req.get("format")
    if not (url and category and filename and fmt):
        return {"ok": False, "error": "missing required field (url/category/filename/format)"}
    if fmt not in ("pdf", "html"):
        return {"ok": False, "error": f"unsupported format: {fmt}"}

    # The filename comes from getDownloadInfo in the TS module,
    # which has already sanitized it. Defensive check here: refuse
    # anything with a path separator or NUL.
    if any(c in filename for c in ("/", "\\", "\x00")) or filename.startswith("."):
        return {"ok": False, "error": f"unsafe filename: {filename!r}"}

    target_dir = PAPERS_ROOT / category
    target = target_dir / f"{filename}.{fmt}"

    # Don't overwrite an existing file unless it's tiny (e.g.
    # the previous download failed mid-stream and left a stub).
    if target.exists() and target.stat().st_size > 1024:
        return {
            "ok": True,
            "path": str(target),
            "size": target.stat().st_size,
            "format": fmt,
            "skipped": "already exists",
        }

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", url, timeout=30.0, follow_redirects=True) as r:
            if r.status_code >= 400:
                return {"ok": False, "error": f"HTTP {r.status_code} from {url}"}
            content_type = r.headers.get("content-type", "")
            # If the actual response is HTML and the caller said
            # PDF, record the actual type so the filename reflects
            # what was saved.
            actual_format = fmt
            if "html" in content_type and fmt == "pdf":
                # doi.org redirects often return HTML even when
                # the original was a PDF landing page. We save
                # the actual bytes with the caller's expected
                # extension; the contentType is in the response
                # so the user knows what they got.
                pass
            with target.open("wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
            size = target.stat().st_size
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"fetch: {e}"}
    except OSError as e:
        return {"ok": False, "error": f"write: {e}"}

    log(f"download: {url} -> {target} ({size} bytes)")
    return {
        "ok": True,
        "path": str(target),
        "size": size,
        "format": fmt,
        "contentType": content_type,
    }


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
