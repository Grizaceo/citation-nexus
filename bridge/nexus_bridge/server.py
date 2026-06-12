"""Citation Nexus — bridge server.

Endpoints:
    GET  /health
    GET  /patterns
    POST /scan
    POST /import
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("nexus_bridge")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DEFAULT_VAULT_ROOT = Path("~/.local/share/nexus/vault").expanduser()

# Built-in catalog of pattern sets, mirrored from src/patterns/sets/*.ts.
# Kept in sync manually; tests verify the TS side matches.
PATTERN_SETS: list[dict[str, Any]] = [
    {
        "id": "citations",
        "name": "Citations",
        "patterns": [
            "arxiv.id",
            "arxiv.abs",
            "doi",
            "doi.url",
            "pmid",
            "pmcid",
            "github",
            "biorxiv",
            "medrxiv",
        ],
    },
    {
        "id": "science",
        "name": "Science (English)",
        "patterns": [
            "math.theorem",
            "math.definition",
            "math.equation",
            "math.bigO",
            "physics.particle",
            "physics.detector",
            "physics.units",
            "bio.gene",
            "bio.protein",
            "bio.technique",
            "bio.taxonomy",
            "cs.venue",
            "cs.model",
            "cs.dataset",
            "chem.formula",
        ],
    },
]

VERSION = "0.1.0"

app = FastAPI(title="Citation Nexus Bridge", version=VERSION)


class Source(BaseModel):
    url: str | None = None
    title: str | None = None


class ImportRequest(BaseModel):
    category: str
    pattern_id: str = Field(alias="patternId")
    text: str
    source: Source | None = None

    model_config = {"populate_by_name": True}


class ImportResponse(BaseModel):
    ok: bool
    stored: dict[str, str] | None = None
    error: str | None = None


class ScanRequest(BaseModel):
    text: str
    sets: list[str] | None = None


class Finding(BaseModel):
    pattern_id: str = Field(alias="patternId")
    category: str
    text: str
    start: int
    end: int

    model_config = {"populate_by_name": True}


class ScanResponse(BaseModel):
    findings: list[Finding]


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "version": VERSION}


@app.get("/patterns")
def patterns() -> dict[str, Any]:
    return {"sets": PATTERN_SETS}


@app.post("/scan", response_model=ScanResponse)
def scan(req: ScanRequest) -> ScanResponse:
    # The bridge is intentionally thin for scan — the agent or extension
    # already has the compiled pattern set. We just re-export the request
    # shape so an external agent without the extension can hit the same
    # endpoint contract.
    raise HTTPException(
        status_code=501,
        detail="Scan runs in the extension. Use the bridge for /import and /patterns only.",
    )


@app.post("/import", response_model=ImportResponse)
def import_finding(req: ImportRequest) -> ImportResponse:
    out_dir = DEFAULT_VAULT_ROOT / "imports" / req.category
    out_dir.mkdir(parents=True, exist_ok=True)
    # Filename: alphanumeric + dash + underscore. Drop dots, slashes,
    # spaces, and any other shell-unfriendly character entirely.
    safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in req.text)[:80]
    target = out_dir / f"{safe}.md"
    # Defence in depth: refuse any path that escapes the vault.
    if not str(target.resolve()).startswith(str(DEFAULT_VAULT_ROOT.resolve())):
        return ImportResponse(ok=False, error="path traversal blocked")
    try:
        target.write_text(_render(req), encoding="utf-8")
        return ImportResponse(ok=True, stored={"path": str(target)})
    except Exception as e:  # noqa: BLE001
        logger.exception("import failed")
        return ImportResponse(ok=False, error=str(e))


def _render(req: ImportRequest) -> str:
    src = req.source or Source()
    return (
        f"# {req.text}\n\n"
        f"- category: {req.category}\n"
        f"- pattern: {req.pattern_id}\n"
        f"- source_url: {src.url or ''}\n"
        f"- source_title: {src.title or ''}\n"
        f"- imported_by: citation-nexus-bridge/{VERSION}\n"
    )


def run() -> None:  # pragma: no cover (entry point)
    parser = argparse.ArgumentParser(description="Citation Nexus bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3002)
    args = parser.parse_args()
    import uvicorn

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":  # pragma: no cover
    run()
