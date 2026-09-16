"""
MedListen — Translation microservice.

Keeps the chat's clinical-reasoning LLM (qwen2.5:14b, see
backend/src/utils/chat/) working entirely in English — its strongest
language for both clinical reasoning and strict JSON-schema following — by
handling the language switch at the two boundary points instead: the
patient's message (their language -> English, before the LLM sees it) and
the assistant's question (English -> their language, before the patient
sees it). See README.md for why this replaced asking the chat LLM to
converse directly in the target language.

Called internally by the Node backend (backend/src/routes/visits.js), not
exposed directly to the internet — same boundary as voice-service.
"""
from __future__ import annotations

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import mock_translate, transliterate_client
from .romanization import looks_romanized

load_dotenv()

app = FastAPI(title="MedListen — Translation")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Same languages the chat engine offers (backend/src/utils/chat/prompts.js).
SUPPORTED_LANGUAGES = {"en", "hi", "bn", "te", "mr", "ta", "gu", "kn", "ml", "pa", "ur", "or"}


def indictrans_available() -> bool:
    from . import indictrans_backend
    return indictrans_backend.is_available()


class TranslateRequest(BaseModel):
    text: str
    source: str
    target: str


@app.get("/languages")
def languages():
    return {
        "supported": sorted(SUPPORTED_LANGUAGES),
        "indictrans2": {"available": indictrans_available()},
        "transliteration": {"available": transliterate_client.is_available()},
    }


@app.post("/translate")
def translate(req: TranslateRequest):
    if req.source not in SUPPORTED_LANGUAGES:
        raise HTTPException(400, f"unsupported source language: {req.source}")
    if req.target not in SUPPORTED_LANGUAGES:
        raise HTTPException(400, f"unsupported target language: {req.target}")
    if not req.text.strip():
        raise HTTPException(400, "text must not be empty")

    if req.source == req.target:
        return {"translation": req.text, "backend": "identity"}

    text = req.text
    transliterated = False
    # A patient without a native-script keyboard often types their answer
    # phonetically in Latin letters (e.g. "Koormaiana vali" for
    # "கூர்மையான வலி") — IndicTrans2 expects native script and mostly just
    # passes Latin-script input through unchanged rather than translating
    # it, so convert it to native script first. Only applies going INTO a
    # non-English script (source != "en"); English input is never
    # romanized-in-that-sense. See transliterate-service/README.md.
    if req.source != "en" and looks_romanized(text):
        converted = transliterate_client.transliterate(text, req.source)
        if converted != text:
            text = converted
            transliterated = True

    if indictrans_available():
        from . import indictrans_backend
        try:
            translation = indictrans_backend.translate(text, req.source, req.target)
        except Exception as exc:  # noqa: BLE001 - surface any backend failure as a clean 502, not a crash
            raise HTTPException(502, f"translation error: {exc}") from exc
        return {"translation": translation, "backend": "indictrans2", "transliterated": transliterated}

    return {
        "translation": mock_translate.translate(text, req.source, req.target),
        "backend": "mock",
        "transliterated": transliterated,
    }
