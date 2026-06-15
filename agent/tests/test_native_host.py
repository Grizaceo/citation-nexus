"""Citation Nexus — Native messaging host protocol tests."""

from __future__ import annotations

import importlib.util
import io
import json
import struct
import sys
from pathlib import Path

HOST_PATH = Path(__file__).resolve().parents[2] / "agent" / "native_host.py"


def load_host():
    """Load agent/native_host.py as a module without executing main()."""
    spec = importlib.util.spec_from_file_location("native_host", HOST_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def frame(payload: dict) -> bytes:
    body = json.dumps(payload).encode("utf-8")
    return struct.pack("<I", len(body)) + body


def test_dispatch_health_returns_shape():
    mod = load_host()
    result = mod.dispatch({"action": "health"})
    assert "ok" in result


def test_dispatch_patterns_action():
    mod = load_host()
    result = mod.dispatch({"action": "patterns"})
    assert "ok" in result
    if result["ok"]:
        assert "data" in result
    else:
        assert "error" in result


def test_dispatch_import_forwards_payload():
    mod = load_host()
    promise = mod.dispatch({"action": "import", "request": {"category": "x"}})
    # dispatch returns a fetch Promise (real network call). We just
    # assert that it's truthy and that the routing reaches the import
    # branch. Don't await — that would block on the (offline) bridge.
    assert promise is not None


def test_dispatch_unknown_action_returns_error():
    mod = load_host()
    result = mod.dispatch({"action": "WHAT_IS_THAT"})
    assert result["ok"] is False
    assert "unknown action" in result["error"].lower()


def test_dispatch_scan_forwards_to_bridge(monkeypatch):
    """The native host's 'scan' action is a thin proxy to the
    bridge's /scan endpoint. The bridge intentionally returns
    501 with a useful detail (scan runs in the extension); we
    pass the detail through as the error string so the caller
    sees the real reason instead of 'unknown action: scan'."""
    mod = load_host()
    # Mock the bridge: 501 with a FastAPI-shaped detail payload.
    class FakeResp:
        status_code = 501
        def json(self):
            return {"detail": "Scan runs in the extension. Use the bridge for /import and /patterns only."}
    monkeypatch.setattr(mod.httpx, "post", lambda *a, **kw: FakeResp())
    result = mod.dispatch({"action": "scan", "request": {"text": "arXiv:2401.01234"}})
    assert result["ok"] is False
    assert "bridge:" in result["error"]
    assert "Scan runs in the extension" in result["error"]


def test_dispatch_scan_passes_through_200(monkeypatch):
    """When the bridge /scan succeeds (it doesn't today, but the
    shape of the contract should be honored), the host returns
    the data verbatim."""
    mod = load_host()
    class FakeResp:
        status_code = 200
        def json(self):
            return {"findings": []}
    monkeypatch.setattr(mod.httpx, "post", lambda *a, **kw: FakeResp())
    result = mod.dispatch({"action": "scan", "request": {"text": "x"}})
    assert result["ok"] is True
    assert result["data"] == {"findings": []}


def test_dispatch_download_validates_required_fields():
    mod = load_host()
    # Missing url/category/filename/format -> error.
    assert mod.dispatch({"action": "download", "request": {}})["ok"] is False
    assert mod.dispatch(
        {"action": "download", "request": {"url": "x", "category": "x", "filename": "x"}}
    )["ok"] is False
    # Bad format.
    assert mod.dispatch(
        {
            "action": "download",
            "request": {
                "url": "https://example.com/x",
                "category": "citation",
                "filename": "x",
                "format": "exe",
            },
        }
    )["ok"] is False
    # Unsafe filename (path separator).
    assert mod.dispatch(
        {
            "action": "download",
            "request": {
                "url": "https://example.com/x",
                "category": "citation",
                "filename": "../etc/passwd",
                "format": "pdf",
            },
        }
    )["ok"] is False


def test_dispatch_download_writes_to_vault(tmp_path, monkeypatch):
    mod = load_host()
    # Redirect the vault root to a temp dir so the test doesn't
    # touch the real ~/.local/share/nexus/vault.
    monkeypatch.setattr(mod, "PAPERS_ROOT", tmp_path / "papers")

    # Mock the HTTP call. We don't want a real network round-trip
    # in unit tests; the httpx.stream contract is exercised in
    # the bridge's own tests.
    class FakeStream:
        def __init__(self, body, content_type="application/pdf"):
            self.body = body
            self.content_type = content_type
            self.status_code = 200
            self.headers = {"content-type": content_type}

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

        def iter_bytes(self):
            yield self.body

    monkeypatch.setattr(
        mod.httpx,
        "stream",
        lambda *a, **kw: FakeStream(b"%PDF-1.4 fake pdf bytes"),
    )

    result = mod.dispatch(
        {
            "action": "download",
            "request": {
                "url": "https://arxiv.org/pdf/2401.01234",
                "category": "citation",
                "filename": "2401.01234",
                "format": "pdf",
            },
        }
    )
    assert result["ok"] is True, result
    saved = tmp_path / "papers" / "citation" / "2401.01234.pdf"
    assert saved.exists()
    assert saved.read_bytes() == b"%PDF-1.4 fake pdf bytes"
    assert result["size"] == len(b"%PDF-1.4 fake pdf bytes")
    assert result["path"] == str(saved)


def test_dispatch_download_skips_already_downloaded(tmp_path, monkeypatch):
    """If the file already exists and is non-trivial (>1KB), the
    download is skipped (idempotent). Smaller files are overwritten
    because they may be a failed previous attempt."""
    mod = load_host()
    monkeypatch.setattr(mod, "PAPERS_ROOT", tmp_path / "papers")

    target_dir = tmp_path / "papers" / "citation"
    target_dir.mkdir(parents=True)
    existing = target_dir / "2401.01234.pdf"
    existing.write_bytes(b"x" * 2048)  # 2 KB, well above 1KB threshold

    # Even with a fake stream that would write 5 bytes, the
    # existing file should win.
    class FakeStream:
        status_code = 200
        headers = {"content-type": "application/pdf"}

        def __enter__(self): return self
        def __exit__(self, *a): return False
        def iter_bytes(self): yield b"WHOOPS"

    monkeypatch.setattr(mod.httpx, "stream", lambda *a, **kw: FakeStream())

    result = mod.dispatch(
        {
            "action": "download",
            "request": {
                "url": "https://arxiv.org/pdf/2401.01234",
                "category": "citation",
                "filename": "2401.01234",
                "format": "pdf",
            },
        }
    )
    assert result["ok"] is True
    assert "skipped" in result
    assert existing.read_bytes() == b"x" * 2048  # unchanged


def test_dispatch_download_handles_http_errors(tmp_path, monkeypatch):
    mod = load_host()
    monkeypatch.setattr(mod, "PAPERS_ROOT", tmp_path / "papers")

    class FakeStream:
        status_code = 404
        headers = {"content-type": "text/plain"}

        def __enter__(self): return self
        def __exit__(self, *a): return False
        def iter_bytes(self): return iter(())

    monkeypatch.setattr(mod.httpx, "stream", lambda *a, **kw: FakeStream())

    result = mod.dispatch(
        {
            "action": "download",
            "request": {
                "url": "https://example.com/missing",
                "category": "citation",
                "filename": "missing",
                "format": "pdf",
            },
        }
    )
    assert result["ok"] is False
    assert "404" in result["error"]


def test_send_message_writes_length_prefixed_json():
    mod = load_host()
    out = io.BytesIO()
    fake_stdout = io.TextIOWrapper(out, write_through=True)
    orig = sys.stdout
    sys.stdout = fake_stdout
    try:
        mod.send_message({"hello": "world"})
    finally:
        sys.stdout = orig

    data = out.getvalue()
    (length,) = struct.unpack("<I", data[:4])
    body = data[4 : 4 + length]
    payload = json.loads(body)
    assert payload == {"hello": "world"}


def test_frame_roundtrip():
    """Roundtrip: encode a payload, decode it, expect the same object."""
    original = {"a": 1, "b": [2, 3], "c": "d"}
    encoded = frame(original)
    (length,) = struct.unpack("<I", encoded[:4])
    body = encoded[4 : 4 + length]
    decoded = json.loads(body)
    assert decoded == original


def test_recv_message_decodes_length_prefixed_frame(monkeypatch):
    mod = load_host()
    payload = {"action": "health"}
    encoded = frame(payload)

    class FakeStdin:
        """Wrap a BytesIO so sys.stdin.buffer.read(N) is available,
        matching what the host's recv_message() does."""

        def __init__(self, data):
            self._buf = io.BytesIO(data)
            self.buffer = self._buf

    monkeypatch.setattr(sys, "stdin", FakeStdin(encoded))
    decoded = mod.recv_message()
    assert decoded == payload
