// Citation Nexus — Options page
// Renders the available pattern sets, persists user toggles, and exposes
// the local bridge URL.

const STORAGE_KEY = "nx.settings.v1";

interface Settings {
  enabledSets: string[];
  bridgeUrl: string;
}

const DEFAULT: Settings = {
  enabledSets: ["citations", "science"],
  bridgeUrl: "http://127.0.0.1:3002",
};

const SETS: { id: string; name: string; description: string }[] = [
  {
    id: "citations",
    name: "Citations",
    description: "arXiv, DOI, PubMed, GitHub, PMC, bioRxiv, medRxiv.",
  },
  {
    id: "science",
    name: "Science (English)",
    description: "Math, physics, biology, CS/ML, chemistry concepts in English.",
  },
];

async function loadSettings(): Promise<Settings> {
  // Cast through `unknown` — chrome.storage typing returns `any` from
  // dynamic key access and we want strict typing inside this module.
  const stored = (await chrome.storage.local.get(STORAGE_KEY)) as unknown as
    | Record<string, Settings | undefined>
    | undefined;
  const value = stored?.[STORAGE_KEY];
  return { ...DEFAULT, ...(value ?? {}) };
}

async function save(s: Settings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: s });
}

async function paintOptions(): Promise<void> {
  const settings = await loadSettings();

  const list = document.getElementById("nx-sets");
  if (!list) return;
  list.innerHTML = "";
  for (const set of SETS) {
    const li = document.createElement("li");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = settings.enabledSets.includes(set.id);
    cb.addEventListener("change", async () => {
      const s = await loadSettings();
      s.enabledSets = cb.checked
        ? Array.from(new Set([...s.enabledSets, set.id]))
        : s.enabledSets.filter((x: string) => x !== set.id);
      await save(s);
    });
    const lbl = document.createElement("label");
    const strong = document.createElement("strong");
    strong.textContent = set.name;
    const small = document.createElement("small");
    small.textContent = set.description;
    lbl.append(strong, small);
    li.append(cb, lbl);
    list.append(li);
  }

  const urlInput = document.getElementById("nx-bridge-url") as HTMLInputElement;
  urlInput.value = settings.bridgeUrl;
  urlInput.addEventListener("change", async () => {
    const s = await loadSettings();
    s.bridgeUrl = urlInput.value;
    await save(s);
  });
}

paintOptions();
