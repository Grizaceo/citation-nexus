// Citation Nexus — Science Pattern Set (English)
// Domain-agnostic English-language patterns for diagonal reading of scientific
// texts. Curated to be high-precision; if a pattern has >10% false-positive
// rate on a real corpus it should be demoted or gated behind context.

import type { PatternSet } from "../core";

export const scienceSet: PatternSet = {
  id: "science",
  name: "Science (English)",
  description:
    "English-language mathematical, physical, biological, CS, and chemistry concepts.",
  patterns: [
    // ── MATH ─────────────────────────────────────────────────────────────
    {
      id: "math.theorem",
      label: "Math theorem",
      category: "math",
      regex: "\\b(?:Theorem|Lemma|Corollary|Proposition|Conjecture|Claim|Remark)\\s+(\\d+(?:\\.\\d+)?)\\b",
      tooltip: "Numbered mathematical statement",
    },
    {
      id: "math.definition",
      label: "Math definition",
      category: "math",
      regex: "\\b(?:Definition|Def\\.?|Axiom|Hypothesis)\\s+(\\d+(?:\\.\\d+)?)\\b",
      tooltip: "Numbered definition",
    },
    {
      id: "math.equation",
      label: "Equation number",
      category: "math",
      regex: "\\((?:eq\\.?|equation)\\s*\\d+\\)|\\(\\s*\\d+\\s*\\)\\s*$",
      flags: "gm",
      tooltip: "Equation reference",
    },
    {
      id: "math.bigO",
      label: "Big-O",
      category: "math",
      regex: "\\bO\\([^)\\n]{1,40}\\)",
      tooltip: "Asymptotic complexity",
    },

    // ── PHYSICS ──────────────────────────────────────────────────────────
    {
      id: "physics.particle",
      label: "Particle",
      category: "physics",
      regex: "\\b(?:muon|tauon?|pion|kaon|proton|neutron|electron|positron|photon|gluon|graviton|W boson|Z boson|Higgs boson|quark|lepton|boson|fermion|hadron|meson|baryon)\\b",
      tooltip: "Standard Model / subatomic particle",
    },
    {
      id: "physics.detector",
      label: "Detector / Lab",
      category: "physics",
      regex: "\\b(?:ATLAS|CMS|LIGO|Virgo|IceCube|Fermilab|CERN|SLAC|KEK|DESY|Gran Sasso| Kamioka )(?:[- ]\\w+){0,3}\\b",
      tooltip: "Physics detector or laboratory",
    },
    {
      id: "physics.units",
      label: "Physical unit",
      category: "physics",
      regex: "\\b\\d+(?:\\.\\d+)?\\s*(?:GeV|MeV|keV|TeV|fm|pm|nm|\\u00b5m|mm|cm|kg|eV)\\b",
      tooltip: "Quantity with SI / particle-physics unit",
    },

    // ── CHEMISTRY (registered before bio.gene so chem wins on overlaps) ─
    {
      id: "chem.formula",
      label: "Chemical formula",
      category: "chemistry",
      regex: "\\b(?:H2O|CO2|N2|O2|H2|Cl2|NaCl|HCl|H2SO4|HNO3|H3PO4|NH3|CH4|C2H6|C3H8|C6H6|C6H12O6|CH3OH|C2H5OH|CaCO3|Fe2O3|TiO2|SiO2)\\b",
      tooltip: "Common chemical formula",
    },

    // ── BIOLOGY ──────────────────────────────────────────────────────────
    {
      id: "bio.gene",
      label: "Gene symbol",
      category: "biology",
      regex: "\\b[A-Z][A-Z0-9]{1,4}\\d[A-Z0-9]?\\b",
      tooltip: "HGNC-style gene symbol (e.g. TP53, BRCA1, EGFR)",
    },
    {
      id: "bio.protein",
      label: "Protein family",
      category: "biology",
      regex: "\\b(?:p53|pRB|Ras|Raf|Mek|Erk|Akt|Stat\\d?|TGF[\\u03b1\\u03b2]|TNF[\\u03b1]|Hsp\\d+|Myc|Fos|Jun)\\b",
      tooltip: "Named protein or family",
    },
    {
      id: "bio.technique",
      label: "Biology technique",
      category: "biology",
      regex: "\\b(?:qPCR|RT-PCR|qRT-PCR|ELISA|Western blot|Southern blot|Northern blot|CRISPR(?:/Cas\\d+)?|ChIP-seq|RNA-seq|scRNA-seq|ATAC-seq|Hi-C|FISH|IHC|flow cytometry)\\b",
      tooltip: "Wet-lab or sequencing technique",
    },
    {
      id: "bio.taxonomy",
      label: "Binomial nomenclature",
      category: "biology",
      // Genus names are typically 5+ letters, or a known short one
      // (Mus, Rattus, Gallus, Apis, Bos, Sus). Filtering out common
      // English sentence-starters (The, This, It, A, An, …) at 3-4
      // chars avoids matching "The muon decays" or "An electron".
      regex: "\\b(?:Mus|Rattus|Gallus|Apis|Bos|Sus)\\s+[a-z]{3,}\\b|\\b[A-Z][a-z]{4,}\\s+[a-z]{3,}\\b",
      tooltip: "Genus + species (binomial)",
    },

    // ── CS / ML ──────────────────────────────────────────────────────────
    {
      id: "cs.venue",
      label: "CS venue",
      category: "cs",
      regex: "\\b(?:NeurIPS|ICML|ICLR|ACL|EMNLP|NAACL|CVPR|ICCV|ECCV|AAAI|IJCAI|UAI|KDD|SIGGRAPH|CHI|USENIX|SOSP|OSDI|FAST|ASPLOS|POPL|PLDI)\\s*(?:'\\d{2,4})?",
      tooltip: "Major CS / ML conference",
    },
    {
      id: "cs.model",
      label: "ML model family",
      category: "cs",
      regex: "\\b(?:Transformer|GPT-[1-9](?:\\.\\d+)?[A-Z]?|BERT(?:\\-[A-Za-z]+)?|RoBERTa|T5|Llama(?:[-\\s]?\\d+)?|LLaMA|Mistral|Mixtral|Gemma|DeepSeek|Qwen|Claude|GPT-4o|RNN|LSTM|GRU|CNN|GAN|VAE|Diffusion|ResNet(?:-\\d+)?|EfficientNet|ViT(?:-\\d+)?)\\b",
      tooltip: "Named ML architecture or model",
    },
    {
      id: "cs.dataset",
      label: "ML dataset",
      category: "cs",
      regex: "\\b(?:MNIST|CIFAR(?:-\\d+)?|ImageNet|GLUE|SuperGLUE|SQuAD|MS-COCO|COCO|CommonCrawl|The Pile|WikiText|LAION|HuggingFaceH4)\\b",
      tooltip: "Common ML evaluation dataset",
    },
  ],
};
