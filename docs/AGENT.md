# Citation Nexus — Agent quick reference

## From any shell

```bash
# Health
curl -s http://127.0.0.1:3002/health

# Pattern catalog
curl -s http://127.0.0.1:3002/patterns

# Import
curl -s -X POST http://127.0.0.1:3002/import \
  -H "Content-Type: application/json" \
  -d '{"category":"citation","patternId":"arxiv.id","text":"arXiv:2401.01234"}'
```

## From a Python agent

```python
import httpx
r = httpx.post("http://127.0.0.1:3002/import", json={
    "category": "citation",
    "patternId": "arxiv.id",
    "text": "arXiv:2401.01234",
    "source": {"url": "https://arxiv.org/abs/2401.01234", "title": "..."},
})
print(r.json())
```

## From the extension's native host (extension ↔ CLI)

```ts
chrome.runtime.sendNativeMessage(
  "com.nexus.host",
  { action: "import", request: { category: "citation", patternId: "arxiv.id", text: "arXiv:2401.01234" } },
  (resp) => console.log(resp)
);
```

## Browser control (separate from the extension)

The `kimi-webbridge` and `chrome-devtools` skills expose full Chrome
control to a CLI agent via CDP. Use those when you want the agent to
*see* the page (so the popup UI is part of the loop) rather than calling
the bridge directly.

## Why three ways?

- **HTTP bridge**: agentic, no Chrome required, simple to script.
- **Native host**: extension-originated actions, sandbox-friendly.
- **CDP / kimi-webbridge**: visual loop, the agent *sees* the popup.
