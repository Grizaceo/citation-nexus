import { resolve } from "node:path";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  alias: {
    "@": resolve("src"),
  },
  manifest: {
    name: "Citation Nexus",
    description:
      "Detect citations (arXiv, DOI, PubMed, GitHub) and English-language science concepts on web pages; highlight for diagonal reading; agentic bridge.",
    permissions: [
      "storage",
      "activeTab",
      "clipboardWrite",
      "scripting",
      "downloads",
      "nativeMessaging",
    ],
    host_permissions: [
      "http://127.0.0.1:3002/*",
      "http://localhost:3002/*",
      "https://export.arxiv.org/*",
      "https://arxiv.org/*",
      "https://eutils.ncbi.nlm.nih.gov/*",
      "https://api.github.com/*",
      "https://api.crossref.org/*",
      "https://www.ebi.ac.uk/europepmc/*",
      "https://api.biorxiv.org/*",
    ],
    action: {
      default_title: "Citation Nexus",
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true,
    },
  },
});
