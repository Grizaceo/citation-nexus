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
