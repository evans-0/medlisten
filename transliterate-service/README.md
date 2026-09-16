# MedListen — Transliteration

Converts romanized (Latin-script) Indian-language text into native
script — e.g. `"Koormaiana vali"` → `"கூர்மையான வலி"` — using AI4Bharat's
**IndicXlit** model. Called internally by `translate-service/` before it
translates a non-English message, not exposed directly to the internet.

## Why this exists

Patients without a native-script keyboard on their phone naturally type
their answers in romanized script (Tanglish, Hinglish, etc.) — it's how
most people actually type Indian languages on an ordinary phone keyboard.
That silently broke translation: `translate-service`'s IndicTrans2 expects
native script, and given Latin-script input it mostly just passes the text
through unchanged instead of translating it. In a live test, a patient
typed `"Koormaiana vali"` (meaning "sharp pain") and IndicTrans2 handed
the chat LLM back `"Koormaiana Vali"` — recognizable to a human, useless
to the model, which didn't understand it as an answer and re-asked the
same question. Native-script input translates correctly:
`"கூர்மையான வலி"` → `"Severe pain"`.

This service is the fix: convert romanized input to native script
*before* it reaches `translate-service`, so the same content that used to
silently fail can translate correctly. See `translate-service/README.md`
and `backend/src/routes/visits.js` for where this fits in the overall
chat pipeline.

## Why its own service, not folded into translate-service

IndicXlit (via the `ai4bharat-transliteration` package) depends on
`fairseq`, which is effectively unmaintained:

- It doesn't build at all on Python 3.9+ (multiple distinct failures were
  hit getting this working — see "Known gaps" below).
- Even on Python 3.7 (what this service actually runs on), it needs an
  old `protobuf` pinned below what pip resolves by default, or
  `torch.utils.tensorboard`'s import crashes.
- Its resulting dependency tree (old `torch`, `tensorflow 2.0`, `numpy
  1.21`) is flatly incompatible with `translate-service`'s modern Python
  3.13 + current `transformers`/`torch` stack — they cannot share a
  virtualenv or process.

So this is a second, independent Python 3.7 service with its own venv,
talking to `translate-service` over one HTTP hop, the same way
`translate-service` and `voice-service` are independent from the Node
backend and from each other.

**Uses Flask, not FastAPI** — `ai4bharat-transliteration`'s own dependency
chain already pulls in `flask`/`flask-cors`, and this environment's
dependency pins are fragile enough already without adding
FastAPI/Pydantic's own version constraints on top.

## Setup

Requires **Python 3.7** specifically (not 3.9+ — see above). If you don't
have it, install it from python.org alongside whatever Python version the
rest of this project uses; they don't need to interact.

```bash
cd transliterate-service
py -3.7 -m venv .venv          # or: C:\path\to\Python37\python.exe -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

This is a heavy, slow install (pulls in `torch`, `tensorflow`, `fairseq`
and their transitive dependencies) — expect several minutes. See
requirements.txt's header comment before changing any pinned version;
several are load-bearing workarounds, not arbitrary choices.

**First run downloads the IndicXlit model** (a few hundred MB) plus
per-language rescoring dictionaries — needs network once. Every call
after that is fully offline.

## Run it

```bash
python app/main.py
```

Runs on port 8030 by default (see `app/main.py`'s `if __name__ ==
"__main__"` block to change it).

```bash
curl localhost:8030/languages

curl -X POST localhost:8030/transliterate \
  -H "Content-Type: application/json" \
  -d '{"text":"Koormaiana vali","lang":"ta"}'
```

## Known gaps — be upfront about these if asked

- **This took real effort to get installed and is worth knowing the
  failure modes of**, in case it needs reinstalling: (1) the PyPI sdist
  for `fairseq==0.12.1` is missing a file its own build script expects
  (`fairseq/version.txt`) — a known upstream packaging bug, worked around
  here by using `fairseq==0.12.2` instead, which built fine; (2) even once
  built, `ai4bharat-transliteration` crashes at import time on a
  `protobuf`/`torch.utils.tensorboard` incompatibility unless `protobuf` is
  pinned to `<=3.20.3`; (3) none of this builds on Python 3.9+ at all in
  this environment — Python 3.7 was required.
- Transliteration quality was verified with a handful of live test phrases
  in Tamil during development (round-tripped through this service, then
  through `translate-service`, and checked by hand) — not a systematic
  evaluation, and not tested at all for most of the other 10 supported
  languages. Same "verify before treating as demo-ready" caveat as
  everywhere else in this project.
- No retry logic — a failure here surfaces as a 502, and
  `translate-service` (or whatever calls this) decides what to do with
  that.
- Detecting *whether* a given message needs transliteration (i.e., "is
  this Latin script") happens in the caller (`translate-service`), not
  here — this service always attempts transliteration on whatever text
  it's given, for whichever language code it's given.
- Only tested on Windows. `pywin32` in requirements.txt is marked
  Windows-only (`sys_platform == 'win32'`) so `pip install` won't choke on
  other platforms, but nothing here has actually been run on macOS/Linux.

## Model / library

`ai4bharat-transliteration` (IndicXlit) — see
https://github.com/AI4Bharat/IndicXlit for the underlying model and
supported-language details.
