"""Citation Nexus — Bridge API protocol tests.

The 'smoke' tests in test_bridge.py cover health, patterns, and a
happy-path import. This file adds the more pedantic contract tests:
shape of the responses, error paths, and the 501 stub for /scan.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture
def client(monkeypatch, tmp_path_factory):
    """A TestClient with the bridge module's default vault root pointed
    at a fresh per-test tmp dir so file writes don't pollute the
    real vault OR each other (tests run in arbitrary order)."""
    import shutil
    import sys
    sys.path.insert(0, str(REPO / "bridge"))
    import nexus_bridge.server as server
    tmp = tmp_path_factory.mktemp("bridge_vault")
    # Pre-clean any leftover .tmp_vault from previous runs.
    legacy = REPO / "bridge" / "tests" / ".tmp_vault"
    if legacy.exists():
        shutil.rmtree(legacy)
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(server, "DEFAULT_VAULT_ROOT", tmp)
        mp.setattr(server, "PAPERS_ROOT", tmp / "papers")
        from fastapi.testclient import TestClient
        yield TestClient(server.app)


def test_health_returns_version(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert isinstance(body["version"], str)
    assert body["version"]  # non-empty


def test_patterns_lists_both_sets(client):
    r = client.get("/patterns")
    assert r.status_code == 200
    body = r.json()
    set_ids = {s["id"] for s in body["sets"]}
    assert "citations" in set_ids
    assert "science" in set_ids
    # Every pattern referenced must exist in the TS files.
    import re
    src = REPO / "src" / "patterns" / "sets"
    ts_ids: set[str] = set()
    for ts_file in src.glob("*.ts"):
        text = ts_file.read_text()
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("id:"):
                m = re.search(r'"([^"]+)"', line)
                if m:
                    ts_ids.add(m.group(1))
    bridge_ids: set[str] = set()
    for s in body["sets"]:
        bridge_ids.update(s["patterns"])
    missing = bridge_ids - ts_ids
    assert not missing, f"patterns referenced in bridge but missing in TS: {missing}"


def test_scan_returns_501(client):
    """The /scan endpoint is intentionally a stub: the scan runs in
    the extension, not the bridge. Verify the explicit 501 so clients
    don't think it's missing."""
    r = client.post("/scan", json={"text": "anything"})
    assert r.status_code == 501
    assert "scan" in r.json()["detail"].lower()


def test_import_writes_markdown_to_vault(client, monkeypatch):
    """Happy-path: a valid import writes a Markdown file with the
    expected frontmatter."""
    r = client.post(
        "/import",
        json={
            "category": "citation",
            "patternId": "arxiv.id",
            "text": "arXiv:2401.01234",
            "source": {"url": "https://x", "title": "T"},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    path = Path(body["stored"]["path"])
    assert path.exists()
    text = path.read_text()
    # Markdown shape
    assert text.startswith("# arXiv:2401.01234")
    assert "- category: citation" in text
    assert "- pattern: arxiv.id" in text
    assert "- source_url: https://x" in text
    assert "- source_title: T" in text


def test_import_filenames_are_safe(client):
    """Pathological text inputs should not produce unsafe filenames."""
    r = client.post(
        "/import",
        json={
            "category": "cs",
            "patternId": "arxiv.id",
            "text": "../../etc/passwd",
        },
    )
    body = r.json()
    if body["ok"]:
        # If it succeeded, the filename was sanitized.
        path = Path(body["stored"]["path"])
        assert ".." not in str(path)
        assert "/etc/passwd" not in str(path)


def test_import_missing_required_fields(client):
    r = client.post("/import", json={"category": "citation"})
    # Pydantic will 422 a missing field
    assert r.status_code in (422, 500)


# ── /download and /batch-download and /papers ───────────────────────
# The bridge mirrors the native host's download action so external
# agents (Hermes/Claude) can fetch papers without going through the
# extension. We mock httpx.stream here — the bridge's HTTP fetch
# behavior is exercised by the test below; the actual wire format
# is the same as the native host's (so the two paths stay in sync).

import sys as _sys


class _FakeResponse:
    def __init__(self, body, content_type="application/pdf", status=200):
        self.body = body
        self.content_type = content_type
        self.status_code = status
        self.headers = {"content-type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def iter_bytes(self):
        yield self.body


def test_download_validates_required_fields(client):
    r = client.post("/download", json={"url": "x", "category": "y"})
    assert r.status_code in (422, 500)
    r = client.post(
        "/download",
        json={"url": "https://x/y", "category": "y", "filename": "z", "format": "exe"},
    )
    assert r.json()["ok"] is False
    assert "format" in r.json()["error"].lower()
    r = client.post(
        "/download",
        json={
            "url": "https://x/y",
            "category": "y",
            "filename": "../etc/passwd",
            "format": "pdf",
        },
    )
    assert r.json()["ok"] is False
    assert "unsafe" in r.json()["error"].lower()


def test_download_happy_path_writes_to_vault(client, monkeypatch):
    import nexus_bridge.server as server

    def fake_stream(*a, **kw):
        return _FakeResponse(b"%PDF-1.4 fake bytes")

    monkeypatch.setattr(server.httpx, "stream", fake_stream)
    r = client.post(
        "/download",
        json={
            "url": "https://arxiv.org/pdf/2401.01234",
            "category": "citation",
            "filename": "2401.01234",
            "format": "pdf",
        },
    )
    body = r.json()
    assert body["ok"] is True, body
    saved = Path(body["path"])
    assert saved.exists()
    assert saved.read_bytes() == b"%PDF-1.4 fake bytes"
    assert body["size"] == len(b"%PDF-1.4 fake bytes")


def test_download_skips_existing_file(client, monkeypatch):
    import nexus_bridge.server as server

    target_dir = server.PAPERS_ROOT / "citation"
    target_dir.mkdir(parents=True, exist_ok=True)
    existing = target_dir / "2401.01234.pdf"
    existing.write_bytes(b"x" * 2048)

    called = {"value": False}

    def fake_stream(*a, **kw):
        called["value"] = True
        return _FakeResponse(b"WHOOPS")

    monkeypatch.setattr(server.httpx, "stream", fake_stream)
    r = client.post(
        "/download",
        json={
            "url": "https://arxiv.org/pdf/2401.01234",
            "category": "citation",
            "filename": "2401.01234",
            "format": "pdf",
        },
    )
    body = r.json()
    assert body["ok"] is True
    assert "skipped" in body
    assert called["value"] is False  # never even hit the network
    assert existing.read_bytes() == b"x" * 2048


def test_batch_download_processes_each_independently(client, monkeypatch):
    import nexus_bridge.server as server

    responses = iter(
        [
            _FakeResponse(b"PDF-OK-1", "application/pdf", 200),
            _FakeResponse(b"HTML-OK-2", "text/html", 200),
            _FakeResponse(b"", "text/plain", 404),  # third one fails
        ]
    )

    def fake_stream(*a, **kw):
        return next(responses)

    monkeypatch.setattr(server.httpx, "stream", fake_stream)
    r = client.post(
        "/batch-download",
        json={
            "items": [
                {
                    "url": "https://arxiv.org/pdf/1",
                    "category": "citation",
                    "filename": "1",
                    "format": "pdf",
                },
                {
                    "url": "https://example.com/2",
                    "category": "citation",
                    "filename": "2",
                    "format": "html",
                },
                {
                    "url": "https://example.com/missing",
                    "category": "citation",
                    "filename": "3",
                    "format": "pdf",
                },
            ]
        },
    )
    body = r.json()
    assert body["ok"] is False  # not all succeeded
    assert len(body["results"]) == 3
    assert body["results"][0]["ok"] is True
    assert body["results"][1]["ok"] is True
    assert body["results"][2]["ok"] is False
    assert "404" in body["results"][2]["error"]
    # The two successful ones actually got written
    assert (server.PAPERS_ROOT / "citation" / "1.pdf").exists()
    assert (server.PAPERS_ROOT / "citation" / "2.html").exists()


def test_papers_listing(client, monkeypatch):
    import nexus_bridge.server as server

    # Seed two papers in the tmp vault.
    cat = server.PAPERS_ROOT / "citation"
    cat.mkdir(parents=True, exist_ok=True)
    (cat / "2401.01234.pdf").write_bytes(b"x" * 1024)
    (cat / "2605.22166.pdf").write_bytes(b"y" * 2048)
    # An empty file (a stub) should be skipped.
    (cat / "stub.pdf").write_bytes(b"")

    r = client.get("/papers?category=citation")
    body = r.json()
    assert body["count"] == 2
    names = sorted(item["filename"] for item in body["items"])
    assert names == ["2401.01234.pdf", "2605.22166.pdf"]


def test_papers_listing_empty_when_no_papers(client):
    r = client.get("/papers")
    assert r.json()["count"] == 0
