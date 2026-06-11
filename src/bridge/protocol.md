# Citation Nexus — Bridge Protocol

The local HTTP bridge (default `http://127.0.0.1:3002`) is the agentic
interface to Citation Nexus. It is *opt-in* and *off by default* — the
extension works fully without it.

## Endpoints

| Method | Path     | Body                                     | Response                       |
|--------|----------|------------------------------------------|--------------------------------|
| GET    | /health  | —                                        | `{ok: true, version: "0.1.0"}` |
| GET    | /patterns| —                                        | `{sets: [...], patterns: [...]}`|
| POST   | /import  | `ImportRequest` (see below)              | `ImportResponse`               |
| POST   | /scan    | `{text: string, sets?: string[]}`        | `{findings: Finding[]}`        |

## ImportRequest

```json
{
  "category": "citation",
  "patternId": "arxiv.id",
  "text": "arXiv:2401.01234",
  "source": { "url": "https://...", "title": "..." }
}
```

## ImportResponse

```json
{ "ok": true, "stored": { "path": "/path/to/file.md" } }
{ "ok": false, "error": "..." }
```

## Why HTTP and not Native Messaging?

- HTTP is trivial to call from any agent (curl, Python, Node, Go).
- Bridge stays out-of-process — extension sandbox is untouched.
- For a single-binary CLI alternative see `agent/native_host.py`.
