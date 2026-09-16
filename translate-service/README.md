# MedListen — Translation

Translates text between English and Hindi, Bengali, Telugu, Marathi,
Tamil, Gujarati, Kannada, Malayalam, Punjabi, Urdu, and Odia, using
AI4Bharat's **IndicTrans2** (distilled 200M) running locally via Hugging
Face `transformers`. Called internally by the Node backend
(`backend/src/routes/visits.js`) — never exposed directly to the internet;
same boundary as `voice-service`.

## Why this exists

The chat's clinical-reasoning LLM (`qwen2.5:14b`, see
`backend/src/utils/chat/`) used to be asked to converse **directly** in the
patient's chosen language — question generation, understanding the
patient's reply, and strict JSON-schema output, all at once, in whatever
language the visit was started in. That put real strain on a single
general-purpose chat model: clinical reasoning, fluent non-English
generation, and rigid structured output are three different skills, and
asking for all three in a non-English language (its weaker one) is a
plausible reason quality was inconsistent across languages.

This service lets the chat LLM work **entirely in English** — its
strongest language on every one of those axes — by moving the language
switch to exactly two boundary points, both handled in
`backend/src/routes/visits.js`:

1. The patient's message: their language → English, before the LLM sees it.
2. The assistant's question: English → their language, before the patient
   sees it.

The saved structured history (chief complaint, HPI, etc.) was always
English regardless of interview language, so that part of the design is
unchanged — only *how* the conversational turns get there changed.

## Why IndicTrans2, not NLLB

This service originally ran on Meta's **NLLB-200**, which is easier to set
up (pure Python, no gated models) and got most translations right. It was
replaced after real testing surfaced a pattern: NLLB repeatedly
mistranslated a handful of specific medical concepts in specific
languages, regardless of phrasing or model size — tested both the 600M
and 1.3B checkpoints. The worst case was "seizure" in Odia, which came
back as unrelated concepts ("came into contact", "he started joking",
"diarrhea") across four different attempts with four different phrasings
and both model sizes. "Vomiting blood" was also unreliable in Malayalam,
Punjabi, and Urdu at both sizes.

**IndicTrans2**, trained specifically on Indian-language data rather than
being a 200-language generalist, got every one of those exact failing
cases right — most on the first try. That's a real quality difference for
a safety-critical feature (this content includes the red-flag emergency
keyword list), not a marginal one, and it's why this service accepts the
extra setup cost:

- **A Windows C++ compiler.** `IndicTransToolkit` (required pre/post-
  processing IndicTrans2's models expect) ships a Cython extension with no
  prebuilt Windows wheel. Installing it on Windows requires the Microsoft
  C++ Build Tools (`winget install Microsoft.VisualStudio.2022.BuildTools`
  with the C++ workload) — a real, ~4-7GB compiler toolchain, not needed
  at all on macOS/Linux.
- **A gated Hugging Face model.** Both IndicTrans2 checkpoints require an
  HF account that has clicked "Agree and access repository" on the model
  page, plus an access token (`HF_TOKEN` in `.env`) — a token alone isn't
  enough without that click. See Setup below.

A larger IndicTrans2 checkpoint (`-1B` instead of `-dist-200M`) also
exists and is separately gated. It wasn't adopted: the 200M model already
scored cleanly across a full test set (18 red-flag phrases × 7 languages,
including every case that broke NLLB), and the 1B model's ~5x larger size
would meaningfully slow down CPU inference — this runs on CPU deliberately
(see below), and every chat turn already does two translation calls.

## Setup

```bash
cd translate-service
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate

# CPU-only torch first — the default PyPI wheel on Windows pulls in a
# multi-GB CUDA runtime this service doesn't need (it runs on CPU
# deliberately, see below).
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

**Windows only** — install a C++ compiler before the next step, or
`pip install -r requirements.txt` will fail trying to build
`IndicTransToolkit`'s Cython extension from source:

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Then:

```bash
pip install -r requirements.txt
```

**Get Hugging Face access** — both IndicTrans2 checkpoints are gated:

1. Create (or log into) a Hugging Face account.
2. Visit both model pages and click "Agree and access repository":
   - https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M
   - https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M
3. Generate a read-only token at https://huggingface.co/settings/tokens
4. Copy `.env.example` to `.env` and set `HF_TOKEN` to that token.

**The first real translation in each direction downloads that checkpoint**
(~1GB each) from Hugging Face — needs network once. Every call after that
is fully offline, and no patient text ever leaves the machine.

Runs in **mock mode** with zero setup (no compiler, no HF account, no
model download) if `transformers`/`torch`/`IndicTransToolkit` aren't all
installed yet — returns the input text tagged `[mock en->hi] ...` so the
rest of the pipeline (the boundary calls in `visits.js`) can be tested
without any of the above.

## Run it

```bash
uvicorn app.main:app --port 8020
```

```bash
curl localhost:8020/languages

curl -X POST localhost:8020/translate \
  -H "Content-Type: application/json" \
  -d '{"text":"I have had a headache since yesterday.","source":"en","target":"hi"}'
```

## Design decisions worth knowing about

- **CPU by default, not GPU** — deliberately, so this doesn't compete with
  Ollama for VRAM. `qwen2.5:14b` (chat) and `medgemma:4b` (OCR) already
  can't both fit in this machine's 12GB GPU at once (see the backend
  README) — adding a third GPU consumer would only make that worse. A
  short sentence translates in roughly 1 second on CPU once both models
  are loaded (tested live for all 12 languages, both directions); the
  model load itself (first request per direction, per process) takes
  longer, and the very first request also downloads the checkpoint.
- **Two directional models, not one multilingual one** — IndicTrans2 uses
  separate en→indic and indic→en checkpoints (unlike NLLB's single
  multilingual model), each lazily loaded on first use in that direction.
- **Only English↔Indic, never Indic↔Indic** — the chat architecture never
  needs to translate Hindi directly to Tamil, for instance; every turn
  passes through English regardless. `main.py` doesn't restrict this at
  the API level, but nothing in this codebase calls it that way, and
  IndicTrans2's en-indic/indic-en checkpoints aren't set up for direct
  Indic-to-Indic translation regardless.
- **Red-flag safety net is untouched by this service** — the keyword-based
  emergency check in `backend/src/utils/chat/safety.js` runs on the
  patient's ORIGINAL text, before any translation call, and against all
  languages' keyword lists at once. That's deliberate: it must keep
  working even if this service is down.

## Known gaps — be upfront about these if asked

- Translation quality was verified during development with a curated set
  of clinical/red-flag phrases per language (each round-tripped through
  translate-then-translate-back and checked by hand — see the git history
  around when Tamil/Gujarati/Kannada/Malayalam/Punjabi/Urdu/Odia were
  added), not a systematic evaluation. Hindi/Bengali/Telugu/Marathi's
  canned strings predate this service and carry the same caveat. Get a
  clinician and native speakers of each language to review before this
  goes anywhere near a real patient — same standing caveat as everywhere
  else in this project.
- No retry logic if a translation fails. The Node backend's two call
  sites handle failure differently on purpose: the incoming (patient →
  English) translation aborts the turn with a clean error if it fails,
  since feeding the LLM the wrong language would silently produce a
  nonsensical turn; the outgoing (English → patient's language)
  translation falls back to showing the English text, since by that point
  the patient's answer has already been processed and losing that would
  cost more than showing one English sentence.
- Non-English chat has a **hard dependency** on this service being up —
  a regression from the original single-LLM design, where translation
  quality was inconsistent but didn't require a second running process.
  Worth knowing if this service isn't started during a demo: non-English
  visits will fail on every message; English visits are entirely
  unaffected (the `source === target` case never calls a model at all).
- The HF token requirement means a fresh clone of this repo can't run
  IndicTrans2 out of the box the way `voice-service` can with
  `faster-whisper` — someone has to do the account/license/token steps
  above once per machine.

## Model / library

`ai4bharat/indictrans2-en-indic-dist-200M` and
`ai4bharat/indictrans2-indic-en-dist-200M` via Hugging Face `transformers`
+ `IndicTransToolkit`. See https://github.com/AI4Bharat/IndicTrans2 for
other checkpoint sizes (including the larger, also-gated `-1B` variants)
if translation quality or speed needs to move.
