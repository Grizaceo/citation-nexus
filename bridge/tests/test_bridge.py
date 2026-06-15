"""Smoke tests for the bridge. Run with `pytest bridge/tests/`."""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BRIDGE = ROOT / "bridge"
sys.path.insert(0, str(BRIDGE))

server = importlib.import_module("nexus_bridge.server")


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    return TestClient(server.app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_patterns(client):
    r = client.get("/patterns")
    assert r.status_code == 200
    sets = {s["id"] for s in r.json()["sets"]}
    assert "citations" in sets
    assert "science" in sets


def test_import_writes_file(client, tmp_path, monkeypatch):
    monkeypatch.setattr(server, "DEFAULT_VAULT_ROOT", tmp_path)
    r = client.post(
        "/import",
        json={
            "category": "citation",
            "patternId": "arxiv.id",
            "text": "arXiv:2401.01234",
            "source": {"url": "https://example.com", "title": "Test"},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "path" in body["stored"]
    path = Path(body["stored"]["path"])
    assert path.exists()
    assert "arXiv:2401.01234" in path.read_text()


def test_pattern_sets_match_ts():
    """Sanity check that the bridge pattern set ids are present in the TS sets."""
    src = ROOT / "src" / "patterns" / "sets"
    # Set ids declared in the PatternSet top-level objects
    # (e.g. `id: "citations"` on the set, not on a pattern). We
    # exclude these so the parser only collects pattern ids. The
    # set ids are stable across the project's lifetime; adding a
    # new set would be a deliberate architectural change.
    SET_IDS = {"citations", "science"}
    ts_ids: set[str] = set()
    for ts_file in src.glob("*.ts"):
        text = ts_file.read_text()
        for line in text.splitlines():
            line = line.strip()
            if line.startswith("id:"):
                pid = line.split('"')[1]
                if pid in SET_IDS:
                    continue
                ts_ids.add(pid)
    bridge_ids: set[str] = set()
    for s in server.PATTERN_SETS:
        bridge_ids.update(s["patterns"])
    missing_in_ts = bridge_ids - ts_ids
    assert not missing_in_ts, f"patterns referenced by bridge but missing in TS: {missing_in_ts}"
    # Reverse direction: every pattern declared in a TS set must also
    # be mirrored in the bridge's PATTERN_SETS. Catches the case where
    # a contributor adds a new pattern to src/patterns/sets/*.ts and
    # forgets to update bridge/nexus_bridge/server.py — the old
    # one-way check would silently let that drift through.
    missing_in_bridge = ts_ids - bridge_ids
    assert not missing_in_bridge, f"patterns in TS but missing in bridge: {missing_in_bridge}"
