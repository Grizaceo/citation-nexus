// Citation Nexus — Bridge Client
// Wraps the local HTTP bridge at the configured URL. Fails soft: the
// extension stays fully usable if the bridge is offline.

import type { Finding } from "@/patterns/core";

const DEFAULT_BRIDGE = "http://127.0.0.1:3002";

export interface ImportRequest {
  category: string;
  patternId: string;
  text: string;
  source?: { url?: string; title?: string };
}

export interface ImportResponse {
  ok: boolean;
  stored?: { path: string };
  error?: string;
}

async function bridgeUrl(): Promise<string> {
  const stored = (await chrome.storage.local.get("nx.settings.v1")) as unknown as
    | Record<string, { bridgeUrl?: string } | undefined>
    | undefined;
  return stored?.["nx.settings.v1"]?.bridgeUrl ?? DEFAULT_BRIDGE;
}

export async function importFinding(f: ImportRequest): Promise<ImportResponse> {
  const url = (await bridgeUrl()) + "/import";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(f),
    });
    if (!r.ok) {
      return { ok: false, error: `Bridge ${r.status}` };
    }
    return (await r.json()) as ImportResponse;
  } catch (e) {
    return { ok: false, error: `Bridge unreachable: ${String(e)}` };
  }
}

export async function bridgeHealth(): Promise<boolean> {
  const url = (await bridgeUrl()) + "/health";
  try {
    const r = await fetch(url);
    return r.ok;
  } catch {
    return false;
  }
}

/** Re-exported Finding type for consumers (popup etc). */
export type { Finding };
