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
      "nativeMessaging",
    ],
    host_permissions: [
      "http://127.0.0.1:3002/*",
      "http://localhost:3002/*",
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
