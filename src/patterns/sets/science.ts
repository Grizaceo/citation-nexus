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
      regex: "\\b(?:Theorem|Lemma|Corollary|Proposition|Conjecture|Claim|Remark)\\s+(\\d+(?:\\.\\d+)*)\\b",
      tooltip: "Numbered mathematical statement",
    },
    {
      id: "math.definition",
      label: "Math definition",
      category: "math",
      regex: "\\b(?:Definition|Def\\.?|Axiom|Hypothesis)\\s+(\\d+(?:\\.\\d+)*)\\b",
      tooltip: "Numbered definition",
    },
    {
      id: "math.equation",
      label: "Equation number",
      category: "math",
      // Paren-enclosed numbers, optionally prefixed with eq/equation.
      regex: "\\((?:eq\\.?|equation)?\\s*(\\d+)\\)",
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
      // Suffix is optional and must be a capitalised proper-noun segment
      // (e.g. "CERN-LHC"), not any word that follows. This avoids
      // matching the start of a sentence like "ATLAS measured the new...".
      regex: "\\b(?:ATLAS|CMS|LIGO|Virgo|IceCube|Fermilab|CERN|SLAC|KEK|DESY)(?:[- ][A-Z][A-Za-z0-9]+){0,1}",
      tooltip: "Physics detector or laboratory",
    },
    {
      id: "physics.units",
      label: "Physical unit",
      category: "physics",
      // Particle-physics and microscopy units. Deliberately omitted
      // km / mm / cm / m / s because they collide with geographic
      // distance (earthquake depth, road distance, object size) and
      // time (seconds). The energy and nuclear-scale units are
      // unambiguous in scientific writing.
      regex:
        "\\b\\d+(?:\\.\\d+)?\\s*(?:GeV|MeV|keV|TeV|fm|pm|nm|\\u00b5m|kg|eV|ps|ns|us|ms)\\b",
      tooltip: "Quantity with SI / particle-physics unit",
    },

    // ── CHEMISTRY (registered before bio.gene so chem wins on overlaps) ─
    {
      id: "chem.formula",
      label: "Chemical formula",
      category: "chemistry",
      priority: 1,
      regex: "\\b(?:H2O|CO2|N2|O2|H2|Cl2|NaCl|HCl|H2SO4|HNO3|H3PO4|NH3|CH4|C2H6|C3H8|C6H6|C6H12O6|CH3OH|C2H5OH|CaCO3|Fe2O3|TiO2|SiO2)\\b",
      tooltip: "Common chemical formula",
    },

    // ── BIOLOGY ──────────────────────────────────────────────────────────
    {
      id: "bio.gene",
      label: "Gene symbol",
      category: "biology",
      // Require a digit (TP53, BRCA1, RB1, ABCA1). All-letter
      // symbols (EGFR, KRAS) would also match common CS/ML acronyms
      // (MNIST, CIFAR) and the precision loss is too high to justify.
      // priority: 0 (default) so explicit patterns win on overlap.
      regex: "\\b[A-Z][A-Z0-9]{1,5}\\d[A-Z0-9]?\\b",
      tooltip: "HGNC-style gene symbol (e.g. TP53, BRCA1, ABCA1)",
    },
    {
      id: "bio.protein",
      label: "Protein family",
      category: "biology",
      // High-specificity protein/gene names that almost never
      // collide with everyday English. Dropped: Jun (too often the
      // month), Myc / Fos (common words outside biology), pH
      // (commonly a unit on its own).
      regex: "(?:p53|pRB|Ras|Raf|Mek|Erk|Akt|Stat\\d?|TGF[αβ]|TNF[α]|Hsp\\d+)",
      tooltip: "Named protein or family",
    },
    {
      id: "bio.technique",
      label: "Biology technique",
      category: "biology",
      // Case-insensitive — covers CRISPR, Crispr, crispr.
      regex: "\\b(?:qPCR|RT-PCR|qRT-PCR|ELISA|Western blot|Southern blot|Northern blot|CRISPR(?:/Cas\\d+)?|ChIP-seq|RNA-seq|scRNA-seq|ATAC-seq|Hi-C|FISH|IHC|flow cytometry)\\b",
      flags: "gi",
      tooltip: "Wet-lab or sequencing technique",
    },
    {
      id: "bio.taxonomy",
      label: "Binomial nomenclature",
      category: "biology",
      // Curated list of common model + pathogenic genera. A 7+ letter
      // generic branch (e.g. `\b[A-Z][a-z]{6,}\b`) was tried and
      // rejected: it matched English prose like "Fermilab announced"
      // and "Transformer from". Genus names in real biological text
      // are almost always a small set; a curated list is the
      // precision-preserving choice.
      regex: "\\b(?:Escherichia|Drosophila|Saccharomyces|Arabidopsis|Caenorhabditis|Toxoplasma|Plasmodium|Mycobacterium|Staphylococcus|Streptococcus|Salmonella|Listeria|Helicobacter|Pseudomonas|Mycoplasma|Candida|Neurospora|Aspergillus|Zea|Oryza|Triticum|Glycine|Rattus|Gallus|Apis|Bos|Sus|Homo)\\s+[a-z]{3,}\\b|\\bMus\\s+musculus\\b",
      tooltip: "Genus + species (binomial)",
    },

    // ── CS / ML ──────────────────────────────────────────────────────────
    {
      id: "cs.venue",
      label: "CS venue",
      category: "cs",
      // Either space-then-year or apostrophe-then-year. The year is
      // optional; without it we get just the venue name.
      regex: "\\b(?:NeurIPS|ICML|ICLR|ACL|EMNLP|NAACL|CVPR|ICCV|ECCV|AAAI|IJCAI|UAI|KDD|SIGGRAPH|CHI|USENIX|SOSP|OSDI|FAST|ASPLOS|POPL|PLDI)(?:\\s\\d{2,4}|'\\d{2,4})?",
      tooltip: "Major CS / ML conference",
    },
    {
      id: "cs.model",
      label: "ML model family",
      category: "cs",
      // Case-insensitive — covers "Transformer" and "transformer" both.
      regex: "\\b(?:Transformer|GPT-[1-9](?:\\.\\d+)?[A-Z]?|BERT(?:\\-[A-Za-z]+)?|RoBERTa|T5|Llama(?:[-\\s]?\\d+)?|LLaMA|Mistral|Mixtral|Gemma|DeepSeek|Qwen|Claude|GPT-4o|RNN|LSTM|GRU|CNN|GAN|VAE|Diffusion|ResNet(?:-\\d+)?|EfficientNet|ViT(?:-\\d+)?)\\b",
      flags: "gi",
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
