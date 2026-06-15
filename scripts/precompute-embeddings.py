#!/usr/bin/env python3
"""Citation Nexus — Pre-compute the embeddings index.

Walks all keywords known to the extension (from `src/patterns/sets/*.ts`),
embeds each one with `paraphrase-multilingual-MiniLM-L12-v2` (the same
ONNX model the extension loads at runtime via @huggingface/transformers),
and writes the result to `public/assets/embeddings-index.json`. WXT copies
`public/*` to `.output/chrome-mv3/*` preserving directory structure, so
the file lands at `.output/chrome-mv3/assets/embeddings-index.json` —
exactly what the runtime reads via `chrome.runtime.getURL` and what the
manifest's `web_accessible_resources` declares.

The output is committed to the repo so the extension can load the
pre-computed index synchronously without any ML inference at startup.
The user only pays the model-load cost when they pick an embedding
model from the popup dropdown.

Re-run this when:
  - new patterns are added to `src/patterns/sets/*.ts`
  - the citation goldset changes (new keywords to look up)
  - the model card updates upstream (the next paraphrase-
    multilingual version might shift vectors)

Install (lighter than sentence-transformers — no torch/torchvision):
    pip install onnxruntime tokenizers huggingface_hub numpy

Usage:
    python3 scripts/precompute-embeddings.py

Output:
    public/assets/embeddings-index.json  (committed to the repo;
    WXT copies it to .output/chrome-mv3/assets/ at build time,
    which is what the runtime reads via chrome.runtime.getURL)
        {
          "model": "paraphrase-multilingual-MiniLM-L12-v2",
          "dimensions": 384,
          "items": [
            { "keyword": "arXiv:2401.01234", "vector": [...384 floats] },
            ...
          ]
        }

Why onnxruntime + tokenizers instead of sentence-transformers:
The extension's runtime uses @huggingface/transformers (which wraps
ONNX Runtime). To guarantee the precomputed vectors are bit-exact
matches for what the extension produces at query time, the
precompute must use the same inference path. Running the same
ONNX model with the same tokenizer config + the same mean-pool +
L2-normalize post-processing is the closest we can get without
shipping the extension's bundle into Python.

sentence-transformers would also work but pulls in PyTorch +
torchvision (~2-3 GB). The onnxruntime-only path is ~50 MB
and matches the runtime contract.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

REPO = Path(__file__).resolve().parents[1]
SETS_DIR = REPO / "src" / "patterns" / "sets"
# Output path is `public/assets/embeddings-index.json`. WXT copies
# `public/*` to `.output/chrome-mv3/*` preserving the directory
# structure, so the file lands at
# `.output/chrome-mv3/assets/embeddings-index.json` — which is
# exactly what the runtime reads via
# `chrome.runtime.getURL("assets/embeddings-index.json")` (and
# what the manifest's web_accessible_resources declares).
OUTPUT = REPO / "public" / "assets" / "embeddings-index.json"

# Same model the extension loads at runtime via
# @huggingface/transformers (see src/lib/embeddings/transformer_loader.ts
# and src/lib/embeddings/models.ts).
MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
MAX_SEQ_LEN = 128  # matches the extension's transformer pipeline default

# Cache downloaded model files in a stable location so re-runs
# don't re-download. The user can wipe it with `rm -rf` if a
# model version change needs a clean re-fetch.
DEFAULT_CACHE = Path(
    os.environ.get(
        "NEXUS_EMBED_CACHE",
        str(Path.home() / ".cache" / "citation-nexus" / "models"),
    )
)


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


def load_model_and_tokenizer(cache_dir: Path) -> tuple[ort.InferenceSession, Tokenizer]:
    """Download (cached) and load the ONNX model + HuggingFace
    tokenizer. Returns a session and a configured tokenizer.

    The tokenizers config matches what @huggingface/transformers
    does internally: pad to longest, truncate at MAX_SEQ_LEN.
    """
    files = ["tokenizer.json", "tokenizer_config.json", "config.json", "onnx/model_quantized.onnx"]
    paths = {
        f: hf_hub_download(MODEL_ID, f, cache_dir=str(cache_dir))
        for f in files
    }
    tok = Tokenizer.from_file(paths["tokenizer.json"])
    tok.enable_padding(pad_id=0, pad_token="<pad>")
    tok.enable_truncation(max_length=MAX_SEQ_LEN)
    sess = ort.InferenceSession(
        paths["onnx/model_quantized.onnx"],
        providers=["CPUExecutionProvider"],
    )
    return sess, tok


def embed_batch(
    sess: ort.InferenceSession,
    tok: Tokenizer,
    texts: Iterable[str],
) -> np.ndarray:
    """Embed each text with mean pooling + L2 normalize, matching
    what the extension's transformer pipeline does at runtime:

        pipe(text, { pooling: "mean", normalize: true })

    Returns an array of shape (n_texts, dimensions), each row
    L2-normalized to unit length.
    """
    rows: list[np.ndarray] = []
    for text in texts:
        enc = tok.encode(text)
        input_ids = np.array([enc.ids], dtype=np.int64)
        attention_mask = np.array([enc.attention_mask], dtype=np.int64)
        token_type_ids = np.zeros_like(input_ids)
        outputs = sess.run(
            None,
            {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
                "token_type_ids": token_type_ids,
            },
        )
        # Pyright types sess.run's first return as a union (ndarray /
        # SparseTensor / list / dict) but the ONNX model always
        # returns ndarrays. Cast through np.asarray to keep both
        # pyright and the type checker happy.
        last_hidden = np.asarray(outputs[0])  # shape [1, seq_len, hidden]
        mask = attention_mask[:, :, None].astype(np.float32)
        summed = (last_hidden * mask).sum(axis=1)
        counts = mask.sum(axis=1).clip(min=1e-9)
        mean_pooled = (summed / counts).squeeze(0)  # shape [hidden]
        norm = float(np.linalg.norm(mean_pooled))
        if norm > 0:
            mean_pooled = mean_pooled / norm
        rows.append(mean_pooled.astype(np.float32))
    return np.stack(rows, axis=0) if rows else np.zeros((0, 0), dtype=np.float32)


def main() -> int:
    keywords = extract_keywords_from_sets()
    print(f"Extracted {len(keywords)} keywords from {SETS_DIR}")

    # Verify the minimum dependency set is available before
    # downloading 100+ MB of model files.
    try:
        import onnxruntime  # noqa: F401
        import tokenizers  # noqa: F401
        import numpy  # noqa: F401
        import huggingface_hub  # noqa: F401
    except ImportError as e:
        print(
            "ERROR: missing dependency.\n"
            "       pip install onnxruntime tokenizers huggingface_hub numpy\n"
            f"       ({e})",
            file=sys.stderr,
        )
        return 1

    cache_dir = DEFAULT_CACHE
    cache_dir.mkdir(parents=True, exist_ok=True)
    print(f"Loading {MODEL_ID} (cache: {cache_dir})...")
    sess, tok = load_model_and_tokenizer(cache_dir)

    # Probe the dimensions from a single embedding so we don't
    # hardcode 384 in the JSON header.
    probe = embed_batch(sess, tok, ["probe"])
    dim = int(probe.shape[1])
    print(f"Embedding {len(keywords)} keywords at dim={dim}...")
    matrix = embed_batch(sess, tok, keywords)
    assert matrix.shape == (len(keywords), dim), (
        f"shape mismatch: got {matrix.shape}, expected ({len(keywords)}, {dim})"
    )

    items = [
        {"keyword": kw, "vector": [float(v) for v in vec]}
        for kw, vec in zip(keywords, matrix)
    ]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(
            {"model": MODEL_ID, "dimensions": dim, "items": items},
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"Wrote {len(items)} items to {OUTPUT} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
