"""
Local machine-translation backend using AI4Bharat's IndicTrans2 (distilled
200M) via Hugging Face `transformers` + `IndicTransToolkit` — CPU by
default, deliberately, so this doesn't compete with Ollama for VRAM (same
reasoning as voice-service's faster-whisper: qwen2.5:14b + medgemma:4b
already fill this machine's 12GB GPU, see backend/README.md).

This replaced an earlier NLLB-200 build. NLLB is a 200-language generalist
and got most translations right, but repeatedly mistranslated a handful of
specific medical concepts in specific languages regardless of phrasing or
model size (tested both the 600M and 1.3B NLLB checkpoints) — most
notably "seizure" in Odia, which came back as unrelated concepts
("came into contact", "joking", "diarrhea") across four different
attempts. IndicTrans2, trained specifically on Indian-language data,
got every one of those exact cases right on the first or second try. See
README.md for the full comparison and why this was worth the extra setup
cost (a Windows C++ compiler for IndicTransToolkit's Cython extension, and
a gated Hugging Face model needing an accepted license + access token).

Two directional models are loaded lazily, on first use in that direction —
this app only ever translates English<->one Indic language, never one
Indic language directly to another:
  - en -> indic: ai4bharat/indictrans2-en-indic-dist-200M
  - indic -> en: ai4bharat/indictrans2-indic-en-dist-200M

Both are GATED on Hugging Face: first use requires HF_TOKEN to be set (see
.env.example) AND that token's account must have clicked "Agree and access
repository" on both model pages — a token alone isn't enough. First use of
each direction also downloads that checkpoint (~1GB each) — needs network
once; every call after that is fully offline, so no patient text leaves
the machine.

IndicTransToolkit's `IndicProcessor` does the pre/post-processing (script
normalization, sentence splitting, number handling) these models were
trained expecting — translation quality is noticeably worse without it,
so it's a real dependency here, not an optional nicety.
"""
from __future__ import annotations

import os

_models = {}  # direction ("en-indic" | "indic-en") -> (tokenizer, model)
_processor = None

# FLORES-200 language codes IndicTrans2 uses internally, mapped from the
# 2-letter codes the rest of MedListen uses (backend/src/utils/chat/prompts.js).
FLORES_CODES = {
    "en": "eng_Latn",
    "hi": "hin_Deva",
    "bn": "ben_Beng",
    "te": "tel_Telu",
    "mr": "mar_Deva",
    "ta": "tam_Taml",
    "gu": "guj_Gujr",
    "kn": "kan_Knda",
    "ml": "mal_Mlym",
    "pa": "pan_Guru",
    "ur": "urd_Arab",
    "or": "ory_Orya",
}

EN_INDIC_MODEL = os.environ.get("INDICTRANS_EN_INDIC_MODEL", "ai4bharat/indictrans2-en-indic-dist-200M")
INDIC_EN_MODEL = os.environ.get("INDICTRANS_INDIC_EN_MODEL", "ai4bharat/indictrans2-indic-en-dist-200M")


def is_available() -> bool:
    """Only checks the libraries are importable, not that a model is
    downloaded/cached or that the gated repos are accessible — those
    surface as a clear error on the first actual translation instead of on
    every poll (same reasoning as voice-service's whisper_backend)."""
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        from IndicTransToolkit.processor import IndicProcessor  # noqa: F401
        return True
    except ImportError:
        return False


def _get_processor():
    global _processor
    if _processor is None:
        from IndicTransToolkit.processor import IndicProcessor
        _processor = IndicProcessor(inference=True)
    return _processor


def _get_model(direction: str):
    if direction not in _models:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        model_name = EN_INDIC_MODEL if direction == "en-indic" else INDIC_EN_MODEL
        tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
        model = AutoModelForSeq2SeqLM.from_pretrained(model_name, trust_remote_code=True)
        model.eval()
        _models[direction] = (tokenizer, model)
    return _models[direction]


def translate(text: str, source: str, target: str) -> str:
    import torch

    if source not in FLORES_CODES:
        raise ValueError(f"unsupported source language: {source}")
    if target not in FLORES_CODES:
        raise ValueError(f"unsupported target language: {target}")

    src_flores = FLORES_CODES[source]
    tgt_flores = FLORES_CODES[target]
    direction = "en-indic" if source == "en" else "indic-en"

    tokenizer, model = _get_model(direction)
    ip = _get_processor()

    batch = ip.preprocess_batch([text], src_lang=src_flores, tgt_lang=tgt_flores)
    inputs = tokenizer(batch, truncation=True, padding="longest", return_tensors="pt")

    with torch.no_grad():
        generated = model.generate(**inputs, max_length=256, num_beams=5)

    decoded = tokenizer.batch_decode(generated, skip_special_tokens=True)
    return ip.postprocess_batch(decoded, lang=tgt_flores)[0].strip()
