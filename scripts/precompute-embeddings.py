#!/usr/bin/env python3
"""Citation Nexus — Pre-compute the embeddings index.

Walks all keywords known to the extension (from `src/patterns/sets/*.ts`),
embeds each one with `paraphrase-multilingual-MiniLM-L12-v2` (int8
quantized onnx model), and writes the result to
`src/lib/embeddings-index.json`.

The output is committed to the repo so the extension can load
the pre-computed index synchronously without any ML inference
at startup. The user only pays the model-load cost when they
pick an embedding model from the popup dropdown.

Re-run this when:
  - new patterns are added to `src/patterns/sets/*.ts`
  - the citation goldset changes (new keywords to look up)
  - the model card updates upstream (the next paraphrase-
    multilingual version might shift vectors)

Install:
    pip install sentence-transformers

Usage:
    python3 scripts/precompute-embeddings.py

Output:
    src/lib/embeddings-index.json
        {
          "model": "paraphrase-multilingual-MiniLM-L12-v2",
          "dimensions": 384,
          "items": [
            { "keyword": "arXiv:2401.01234", "vector": [...384 floats] },
            ...
          ]
        }
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SETS_DIR = REPO / "src" / "patterns" / "sets"
OUTPUT = REPO / "src" / "lib" / "embeddings-index.json"

# The model we ship in v1. Override via env if you want to use a
# different model from the registry (e.g. SPECTER2) — but the
# index file is then tagged with the model name so the extension
# knows which model to load at runtime.
MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"


def extract_keywords_from_sets() -> list[str]:
    """Walk the TS pattern files and pull out the human-readable
    keyword tokens. The TS file is the source of truth; this
    function just greps for things that look like keyword/label
    strings. We deliberately do NOT try to compile the TS — that
    would require Node + WXT. The grep is robust enough for our
    pattern files because we use a consistent shape:

        label: "arXiv ID"
        tooltip: "arXiv preprint"
        regex: "arXiv:\\\\s*(\\\\d{4}\\\\.\\\\d{4,5}..."

    We extract:
        - the `label` string (best: human-curated keyword)
        - the `tooltip` string (fallback)
        - any quoted string inside a `regex` field
    """
    keywords: set[str] = set()
    label_re = re.compile(r'^\s*label:\s*"([^"]+)"', re.MULTILINE)
    tooltip_re = re.compile(r'^\s*tooltip:\s*"([^"]+)"', re.MULTILINE)
    for ts in sorted(SETS_DIR.glob("*.ts")):
        text = ts.read_text(encoding="utf-8")
        for m in label_re.finditer(text):
            keywords.add(m.group(1).strip())
        for m in tooltip_re.finditer(text):
            keywords.add(m.group(1).strip())
    # Some well-known citation IDs from the goldset that we want
    # to ensure are findable via the search box.
    keywords.update({
        "arXiv:2401.01234",
        "arXiv:2412.12345",
        "arXiv:2605.22166",
        "10.1038/nature12373",
        "10.1126/science.aaa8680",
        "Llama-3",
        "GPT-4o",
        "Mistral",
        "Phi-3",
        "Gemma",
        "DeepSeek",
        "BERT",
        "RoBERTa",
        "T5",
        "Mixtral",
        "Qwen",
        "Transformer",
        "ResNet",
        "ViT",
        "CNN",
        "LSTM",
        "GAN",
        "VAE",
        "H2O",
        "CO2",
        "H2SO4",
        "Z boson",
        "W boson",
        "Higgs boson",
        "TP53",
        "BRCA1",
        "Ras",
        "Akt",
        "p53",
        "MNIST",
        "CIFAR-10",
        "ImageNet",
        "GLUE",
        "SQuAD",
        "NeurIPS",
        "ICML",
        "ACL",
    })
    return sorted(keywords)


def main() -> int:
    keywords = extract_keywords_from_sets()
    print(f"Extracted {len(keywords)} keywords from {SETS_DIR}")

    try:
        from sentence_transformers import SentenceTransformer
    except ImportError:
        print(
            "ERROR: sentence-transformers is not installed.\n"
            "       pip install sentence-transformers",
            file=sys.stderr,
        )
        return 1

    print(f"Loading {MODEL_NAME}...")
    model = SentenceTransformer(MODEL_NAME)
    dim = model.get_sentence_embedding_dimension()
    print(f"Embedding {len(keywords)} keywords at dim={dim}...")
    vectors = model.encode(keywords, normalize_embeddings=True, show_progress_bar=False)

    items = [
        {"keyword": kw, "vector": [float(v) for v in vec]}
        for kw, vec in zip(keywords, vectors)
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {"model": MODEL_NAME, "dimensions": dim, "items": items},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"Wrote {len(items)} items to {OUTPUT} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
