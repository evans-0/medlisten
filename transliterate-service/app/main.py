"""
MedListen — Transliteration microservice.

Converts romanized (Latin-script) Indian-language text into native script —
e.g. "Koormaiana vali" -> "கூர்மையான வலி" — using AI4Bharat's IndicXlit
model (via the `ai4bharat-transliteration` package).

Why this exists: patients without a native-script keyboard on their phone
naturally type in romanized script (Tanglish, Hinglish, etc.). Feeding that
straight into the translation service (translate-service/, IndicTrans2)
silently fails — IndicTrans2 expects native script and, given Latin-script
input, mostly just passes it through unchanged rather than translating it,
so the chat LLM ends up seeing garbage ("Koormaiana Vali") instead of the
patient's actual answer ("sharp pain") and the conversation stalls,
re-asking the same question. This service is the fix: detect Latin-script
input for a non-English visit and convert it to native script BEFORE
translate-service ever sees it. See translate-service/README.md for the
full story and translate-service/app/main.py for where this is called.

Runs as its OWN service with its own Python environment (not folded into
translate-service) because IndicXlit depends on `fairseq`, which is
essentially unmaintained and only reliably installable on Python <=3.7
with old torch/numpy/protobuf pins — completely incompatible with
translate-service's modern Python 3.13 + current `transformers` stack.
Two services, two Python versions, one HTTP hop between them.

Uses Flask, not FastAPI: `ai4bharat-transliteration`'s own dependency
chain already pulls in `flask`/`flask-cors`, and this Python 3.7
environment's dependency pins are fragile enough already (see
requirements.txt) without adding FastAPI/Pydantic's own version
constraints on top.
"""
from __future__ import annotations

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

_engine = None

# Every language IndicXlit supports; intersected with what the chat engine
# actually offers (backend/src/utils/chat/prompts.js) is what matters in
# practice, but there's no harm exposing the full set here.
SUPPORTED_LANGUAGES = {
    'as', 'bn', 'brx', 'gom', 'gu', 'hi', 'kn', 'ks', 'mai', 'ml', 'mni',
    'mr', 'ne', 'or', 'pa', 'sa', 'sd', 'si', 'ta', 'te', 'ur',
}


def is_available() -> bool:
    try:
        import ai4bharat.transliteration  # noqa: F401
        return True
    except ImportError:
        return False


def _get_engine():
    global _engine
    if _engine is None:
        from ai4bharat.transliteration import XlitEngine
        # Loading this (model weights + one rescoring dictionary per
        # language) takes roughly 60-90s. Doing it here, guarded by
        # `_engine is None`, means it happens once — either eagerly at
        # startup (see __main__ below) or lazily on whichever request
        # gets here first if startup warmup was skipped.
        _engine = XlitEngine('all', beam_width=4)
    return _engine


@app.route('/languages')
def languages():
    return jsonify({
        'supported': sorted(SUPPORTED_LANGUAGES),
        'indicxlit': {'available': is_available()},
    })


@app.route('/transliterate', methods=['POST'])
def transliterate():
    data = request.get_json(force=True, silent=True) or {}
    text = data.get('text', '')
    lang = data.get('lang', '')

    if lang not in SUPPORTED_LANGUAGES:
        return jsonify({'message': f'unsupported language: {lang}'}), 400
    if not text.strip():
        return jsonify({'message': 'text must not be empty'}), 400

    try:
        engine = _get_engine()
        # Passing lang_code explicitly (needed since this engine is
        # initialized with 'all' languages, not one) makes this return a
        # plain string directly — NOT the {lang: text} dict you get
        # calling translit_sentence() with no lang_code on a
        # single-language-initialized engine. Mixing the two up throws
        # 'str' object has no attribute 'get'.
        transliterated = engine.translit_sentence(text, lang_code=lang)
    except Exception as exc:  # noqa: BLE001 - surface any backend failure as a clean 502, not a crash
        return jsonify({'message': f'transliteration error: {exc}'}), 502

    return jsonify({'transliterated': transliterated})


if __name__ == '__main__':
    # Eager warmup: load the model/dictionaries now, at startup, instead of
    # on whichever request happens to arrive first. Without this, the
    # first real translation of the session pays the full ~60-90s load
    # cost inline — and worse, Flask's single-threaded dev server (see
    # threaded=True below) can't even serve a concurrent /languages health
    # check while that load is in progress, which briefly made this
    # service look down to translate-service during testing.
    if is_available():
        print('Warming up transliteration engine (loads model + dictionaries, ~60-90s)...')
        _get_engine()
        print('Transliteration engine ready.')
    # threaded=True: without it, Flask's dev server handles one request at
    # a time — a single slow transliteration call would block every other
    # request (including health checks) behind it.
    app.run(host='0.0.0.0', port=8030, threaded=True)
