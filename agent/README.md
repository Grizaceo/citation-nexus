# Citation Nexus — Agent integration

Two ways for an agent to drive Citation Nexus from the shell:

## 1. HTTP bridge (recommended, no Chrome required)

```bash
# Health check
curl -s http://127.0.0.1:3002/health

# List pattern sets
curl -s http://127.0.0.1:3002/patterns

# Import a finding
curl -s -X POST http://127.0.0.1:3002/import \
  -H "Content-Type: application/json" \
  -d '{
    "category": "citation",
    "patternId": "arxiv.id",
    "text": "arXiv:2401.01234",
    "source": {"url": "https://example.com", "title": "Paper"}
  }'
```

The bridge is the simplest path. Start it once (`nexus-bridge` or
`uvicorn nexus_bridge.server:app --port 3002`) and forget.

## 2. Native messaging host (extension ↔ CLI)

If the extension is running in Chrome and the agent is the same machine,
Chrome can route messages to a small Python host binary:

1. Copy `agent/native_host.py` to `~/.local/bin/nexus-host` and make it
   executable: `chmod +x ~/.local/bin/nexus-host`.
2. Edit `agent/manifest.json` — replace `REPLACE_WITH_EXTENSION_ID` with the
   real ID shown in `chrome://extensions`.
3. Install the manifest where Chrome looks for it:

   ```bash
   mkdir -p ~/.config/google-chrome/NativeMessagingHosts
   cp agent/manifest.json \
     ~/.config/google-chrome/NativeMessagingHosts/com.nexus.host.json
   ```

4. Restart Chrome.

5. From any agent shell, send a message via the extension (which routes to
   the host binary):

   ```ts
   // inside the extension
   chrome.runtime.sendNativeMessage("com.nexus.host", { action: "patterns" }, (resp) => {
     console.log(resp);
   });
   ```

The host speaks the same JSON dialect as the bridge. In production we
typically call the bridge directly (option 1) and use the native host only
when we want the message to *originate* from the extension itself.

## Hermes / Claude / generic CLI

Any tool that can `curl` or `fetch` can drive the bridge. For a one-liner:

```bash
echo '{"category":"citation","patternId":"arxiv.id","text":"arXiv:2606.01234"}' \
  | curl -s -X POST -H "Content-Type: application/json" --data-binary @- \
    http://127.0.0.1:3002/import
```

For richer workflows (e.g. scrape a page with Playwright, then import every
arXiv ID), see the `kimi-webbridge` and `chrome-devtools` skills — they
expose Chrome control to a CLI agent without the extension.
