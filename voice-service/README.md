# MedListen — Voice / Speech-to-Text

Takes a recorded audio clip and returns plain text, using `faster-whisper`
(a CTranslate2 reimplementation of OpenAI's Whisper). Ported from a
teammate's `voice-module` in the team's broader SIH2026 prototype.

Called internally by the Node backend (`backend/src/routes/voice.js`) — it's
never exposed directly to the internet; nginx only proxies the Node
backend's port, so this service's own port doesn't need to be reachable
from a phone.

**What this doesn't do**, same scope boundaries as the source module:
- No conversational logic — it hands back text, the chat's own flow
  (`backend/src/routes/visits.js`) treats it exactly like the patient typed it.
- No text-to-speech, no real-time/streaming captioning — record a clip,
  upload, get text back.
- No persistence — nothing is stored; a transcript is handed back once and
  the audio itself is discarded (never written to disk here).

## Setup

```bash
cd voice-service
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

This install is heavier than the Node side — `faster-whisper` pulls in
`ctranslate2` and a few other sizeable packages. Give it a few minutes on
first install.

No API key needed — runs entirely locally. Copy `.env.example` to `.env` if
you want to change the model size or force CPU/GPU (see below); the
defaults work with zero configuration.

**The first real transcription downloads the Whisper model** (~500MB for
the default "small" size) from Hugging Face — needs network once. Every
transcription after that is fully offline, and no audio ever leaves the
machine. Only ever use synthetic/made-up test recordings during development
— never record and upload a real patient's actual medical complaint.

Runs in **mock mode** with zero setup (no model download needed) if
`faster-whisper` isn't installed yet — a fixed canned transcript regardless
of what audio you send, so the rest of the pipeline (the mic button, the
chat text box getting filled in) can be tested without the download.

## Run it

```bash
uvicorn app.main:app --port 8010
```

```bash
curl localhost:8010/backends

curl -X POST localhost:8010/transcribe -F "file=@clip.webm" -F "backend=auto"
```

## Design decisions worth knowing about

- **CPU by default, not GPU** (`WHISPER_DEVICE=cpu`) — deliberately, so this
  doesn't compete with Ollama for VRAM. This matters concretely in this
  project: `qwen2.5:14b` (chat) and `medgemma:4b` (OCR) already can't both
  fit in this machine's 12GB of VRAM at the same time (see the backend
  README) — adding Whisper as a third GPU consumer would only make that
  worse. A short patient utterance transcribes in low single-digit seconds
  on CPU with the "small" model on ordinary laptop hardware.
- **Multilingual by default** — `language` is left unset (auto-detect)
  unless the caller passes a hint, matching the same language codes as the
  chat engine (`en`, `hi`, `bn`, `te`, `mr`). Whisper's own language
  coverage differs from qwen's, though — worth testing each language you
  actually plan to demo rather than assuming it works.
- **VAD (voice-activity detection) filtering is on** — skips silence/
  background noise instead of transcribing it, reducing hallucinated text
  from a quiet room.
- **No audio format validation on upload** — a malformed or empty file just
  fails at transcription time with a clear 502 rather than being caught
  earlier. Known gap, not a design principle.

## Known gaps — be upfront about these if asked

- Transcription accuracy on real Indian-language speech (accents, code-
  switching, background noise) is unverified beyond a quick synthetic test
  — same caveat as everywhere else in this project: verify with a real
  microphone and real speech before treating this as demo-ready.
- No retry logic if a transcription fails — the frontend treats a failure
  here as "the patient can just type instead," not a silent retry.

## Model name / library

`faster-whisper` (CTranslate2-based). `WHISPER_MODEL` defaults to `small`.
Check https://github.com/SYSTRAN/faster-whisper for current model options.
