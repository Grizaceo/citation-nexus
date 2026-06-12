"""Citation Nexus — bridge server.

Endpoints:
    GET  /health
    GET  /patterns
    POST /scan
    POST /import
    POST /download          (new: fetch + write a paper to vault/papers/)
    GET  /papers            (new: list downloaded files)
    POST /batch-download    (new: download many in one call)
"""

from __future__ import annotations

import argparse
import logging
import mimetypes
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("nexus_bridge")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DEFAULT_VAULT_ROOT = Path("~/.local/share/nexus/vault").expanduser()
# Papers go under vault/papers/<category>/<id>.<format>. Mirrors
# agent/native_host.py's PAPERS_ROOT.
PAPERS_ROOT = DEFAULT_VAULT_ROOT / "papers"

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


class DownloadRequest(BaseModel):
    """Single-file download request. Mirrors DownloadInfo from the
    TS downloader module so the agent and the extension share
    the same payload shape."""
    url: str
    category: str
    filename: str
    format: str  # "pdf" | "html"


class DownloadResponse(BaseModel):
    ok: bool
    path: str | None = None
    size: int | None = None
    content_type: str | None = None
    skipped: str | None = None
    error: str | None = None


class BatchDownloadRequest(BaseModel):
    """Batch download — a list of DownloadRequest bodies, processed
    in order. The response mirrors the per-file status so the
    caller knows which ones succeeded and which were skipped."""
    items: list[DownloadRequest]


class BatchDownloadResponse(BaseModel):
    ok: bool
    results: list[DownloadResponse]


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


def _do_download(req: DownloadRequest) -> DownloadResponse:
    """Fetch `url` and write the body to PAPERS_ROOT/<category>/<filename>.<format>.

    Mirrors the logic in agent/native_host.py — same gating
    (skip if file exists and is >1 KB), same path safety
    (refuse path separators), same shape of response.
    """
    if not (req.url and req.category and req.filename and req.format):
        return DownloadResponse(ok=False, error="missing required field")
    if req.format not in ("pdf", "html"):
        return DownloadResponse(ok=False, error=f"unsupported format: {req.format}")
    if any(c in req.filename for c in ("/", "\\", "\x00")) or req.filename.startswith("."):
        return DownloadResponse(ok=False, error=f"unsafe filename: {req.filename!r}")

    target_dir = PAPERS_ROOT / req.category
    target = target_dir / f"{req.filename}.{req.format}"

    if target.exists() and target.stat().st_size > 1024:
        return DownloadResponse(
            ok=True,
            path=str(target),
            size=target.stat().st_size,
            content_type=mimetypes.guess_type(str(target))[0] or "",
            skipped="already exists",
        )

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        with httpx.stream("GET", req.url, timeout=30.0, follow_redirects=True) as r:
            if r.status_code >= 400:
                return DownloadResponse(
                    ok=False, error=f"HTTP {r.status_code} from {req.url}"
                )
            content_type = r.headers.get("content-type", "")
            with target.open("wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
            size = target.stat().st_size
    except httpx.HTTPError as e:
        return DownloadResponse(ok=False, error=f"fetch: {e}")
    except OSError as e:
        return DownloadResponse(ok=False, error=f"write: {e}")

    return DownloadResponse(
        ok=True,
        path=str(target),
        size=size,
        content_type=content_type,
    )


@app.post("/download", response_model=DownloadResponse)
def download(req: DownloadRequest) -> DownloadResponse:
    """Single-file download. The agent can use this to fetch a
    paper the extension surfaced."""
    return _do_download(req)


@app.post("/batch-download", response_model=BatchDownloadResponse)
def batch_download(req: BatchDownloadRequest) -> BatchDownloadResponse:
    """Many downloads in one call. Items are processed sequentially;
    a failure on one does not abort the others. The response lists
    per-item status so the caller can present a summary."""
    results = [_do_download(item) for item in req.items]
    return BatchDownloadResponse(ok=all(r.ok for r in results), results=results)


@app.get("/papers")
def list_papers(category: str | None = None) -> dict[str, Any]:
    """List downloaded papers. Optional `?category=...` filter.
    Returns paths + sizes so the agent can summarize what's
    on disk before asking the user what to do with it."""
    base = PAPERS_ROOT if category is None else PAPERS_ROOT / category
    if not base.exists():
        return {"count": 0, "items": [], "category": category}
    items: list[dict[str, Any]] = []
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        if path.stat().st_size == 0:
            continue
        # path is e.g. <PAPERS_ROOT>/<category>/<filename>.<format>
        rel = path.relative_to(PAPERS_ROOT)
        parts = rel.parts
        cat = parts[0] if len(parts) > 1 else ""
        items.append(
            {
                "category": cat,
                "filename": path.name,
                "path": str(path),
                "size": path.stat().st_size,
            }
        )
    return {"count": len(items), "items": items, "category": category}


def run() -> None:  # pragma: no cover (entry point)
    parser = argparse.ArgumentParser(description="Citation Nexus bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3002)
    args = parser.parse_args()
    import uvicorn

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":  # pragma: no cover
    run()
