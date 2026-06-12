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
def client(monkeypatch):
    """A TestClient with the bridge module's default vault root pointed
    at a tmp dir so file writes don't pollute the real vault."""
    import sys
    sys.path.insert(0, str(REPO / "bridge"))
    import nexus_bridge.server as server
    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(server, "DEFAULT_VAULT_ROOT", REPO / "bridge" / "tests" / ".tmp_vault")
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
