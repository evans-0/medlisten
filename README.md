# MedListen — Patient Dashboard (SIH26047 core MVP)

A patient records dashboard built as the foundation for SIH Problem Statement 26047
("Patient Case-Taking Software" for AIIA, Ministry of Ayush). This MVP covers:

- Patient registration/login with a (mocked) 14-digit ABHA ID + password
- Patient dashboard: editable structured medical history, document upload
- Document extraction: uploaded images (JPEG/PNG/WEBP) go through a local
  Ollama vision model (`medgemma:4b`, medical-domain-tuned) that returns a
  **structured** extraction — diagnoses, presenting complaints, vitals,
  medications (name/dosage/frequency), investigations (value/reference
  range/abnormal flag), procedures, plus a confidence score per field and a
  `needs_review` flag for anything uncertain (e.g. hard-to-read handwriting).
  Text-based PDFs go through the same structured-extraction prompt using
  their pdf-parse text layer (no vision step needed). Scanned/image-only
  PDFs aren't handled yet — that needs a PDF→image render step, listed below
  as a follow-up. The extraction schema/prompt design (confidence-per-field,
  presenting-complaints-vs-diagnosis separation, abnormal only ever read off
  a printed reference range) is ported from a teammate's `ocr-module` in the
  team's broader SIH2026 prototype, which arrived at this design through
  real testing.
- Conversational intake chatbot: the patient chats in plain language
  ("I've had a headache since yesterday") and a local Ollama chat model
  (`qwen2.5:14b`) fills in a structured history live, one question at a
  time, while the patient watches a "Captured so far" panel update turn by
  turn. History-of-present-illness questioning follows SOCRATES (Site,
  Onset, Character, Radiation, Associated symptoms, Timing,
  Exacerbating/relieving, Severity) for a regular visit — but for an AYUSH
  (Ayurveda) visit, SOCRATES is replaced entirely by the Dashavidha Pariksha
  (ten-fold Ayurvedic constitutional examination) plus Nidana
  (causative-factor assessment), since SOCRATES is a Western framework that
  doesn't belong layered onto an authentically Ayurvedic history. See
  `backend/src/utils/chat/prompts.js` for both frameworks. Two guardrails
  run independently of the LLM: a
  rule-based keyword check for emergency symptoms (fires before any model
  call, so it works even if the model is down) and a small RAG layer that
  retrieves a matching clinical guideline (via `nomic-embed-text` embeddings
  over a curated `guidelines.json`) to ground follow-up questions in a vetted
  protocol instead of free-wheeling. Each conversation is saved as its own
  dated **Visit** — a chronological timeline distinct from the patient's
  cumulative `MedicalHistory` record, so "fever last month, cough this week"
  both stay visible as separate episodes rather than one overwriting the
  other. This chat engine (schema, prompts, safety net, RAG design, and the
  retry/fallback logic for when a local model leaves a turn malformed) is
  ported from a teammate's `converse-module` in the SIH2026 prototype. When
  a visit ends (naturally, red-flagged, or the patient ends it themselves)
  its genuinely-cumulative fields — past history, allergies, family
  history, current medications — get merged into `MedicalHistory` too, so
  the patient doesn't have to duplicate what they just told the chatbot
  into the manual form. Uploaded documents do the same with their
  extracted diagnoses/medications/procedures. See "Notes on scope" below
  for exactly what is and isn't merged, and why.
- Multilingual chat: the patient can choose English, Hindi, Bengali,
  Telugu, Marathi, Tamil, Gujarati, Kannada, Malayalam, Punjabi, Urdu, or
  Odia when starting a conversation, and the chat happens in that
  language. Under the hood, `qwen2.5:14b` never actually sees or produces
  anything but English — a separate local translation service
  (`translate-service/`, AI4Bharat's IndicTrans2) translates the patient's
  message to English before the LLM sees it, and translates the LLM's
  question back to the patient's language before they see it. This
  replaced an earlier design where the chat LLM was asked to converse
  directly in the target language itself; splitting the language switch
  into its own step let the chat model focus on clinical reasoning and
  strict JSON output — its strongest suit — in the one language it does
  that most reliably in, while a purpose-built translation model handles
  the language switch. See `translate-service/README.md` for why
  (including why that service runs IndicTrans2 rather than the
  easier-to-set-up NLLB-200 it started on), and for the trade-off it
  introduces (non-English chat now depends on a second running service).
  The saved structured record always stays in English regardless, so any
  clinician can read it independent of which language a visit happened in.
  Tamil specifically was evaluated and dropped in an earlier design —
  `qwen2.5:14b` produced consistently broken/nonsensical Tamil when asked
  to converse in it directly — and is back now that translation happens
  through IndicTrans2 instead of the chat LLM itself. See
  `backend/src/utils/chat/prompts.js` for the details and for what a
  native-speaker review still needs to check before this is demo-ready in
  any of these languages.
- Voice input: a mic button next to the chat input, with two backends —
  the transcript always fills the text box for the patient to review and
  send, never auto-submitted:
  1. **Live, in-browser** (preferred when available): the Web Speech API
     transcribes in real time as the patient talks, word by word, with no
     backend round trip. Zero setup, works in Chrome and most Chromium
     browsers. Trade-off, worth being upfront about: this is typically
     *not* on-device — the browser usually sends audio to a cloud
     recognition service — and some privacy-focused browsers (Brave has a
     history of this) restrict it, so it isn't guaranteed to work
     everywhere the rest of this app does.
  2. **Record-then-transcribe fallback**, used automatically when the
     browser has no live API: records a clip and transcribes it via a
     local `faster-whisper` model (CPU-only, so it doesn't compete with
     Ollama's GPU usage) — genuinely local, no audio leaves the machine.
     Runs as a separate small Python service (`voice-service/`), ported
     from a teammate's `voice-module` in the SIH2026 prototype; the Node
     backend proxies to it so nothing about the phone-facing API surface
     changes.

  The mic button hides itself only if *neither* backend is available, and
  any transcription failure on either path just tells the patient to type
  instead rather than blocking them. A genuinely real-time *and* fully
  local option (chunked streaming through `faster-whisper`) is a known
  follow-up, not built yet.
- Doctor registration/login, with a search-by-ABHA-ID lookup into any patient's
  history, visit timeline, and documents

The full problem statement also calls for live ABDM/FHIR integration —
intentionally out of scope for this pass, a natural next phase once this
foundation is in place.

## Stack

- Backend: Node.js, Express, MongoDB (Mongoose), JWT auth, Multer, pdf-parse
- Document extraction: [Ollama](https://ollama.com) running `medgemma:4b`
  (a medical-domain vision model) locally
- Conversational intake: Ollama running `qwen2.5:14b` (chat) and
  `nomic-embed-text` (RAG retrieval) locally
- Voice input: browser-native Web Speech API (live, preferred), falling back to
  Python + FastAPI + `faster-whisper` (`voice-service/`, CPU-only) when unavailable
- Translation: Python + FastAPI + AI4Bharat's IndicTrans2 (`translate-service/`,
  CPU-only) for non-English chat visits
- Frontend: React (Vite), React Router, Axios

## Prerequisites

- Node.js 18+
- [Ollama](https://ollama.com) installed and running, with the vision model pulled:
  ```bash
  ollama pull medgemma:4b
  ```
  The backend calls `http://localhost:11434` by default (configurable via
  `OLLAMA_HOST`/`OLLAMA_VISION_MODEL`/`OLLAMA_TEXT_MODEL` in `.env`). If
  Ollama isn't running, uploads still save but their extraction status will
  show as "failed".
  `llama3.2-vision` also works as a drop-in alternative if your Ollama build
  supports its `mllama` architecture — on this dev setup it reproducibly
  didn't (`error loading model: unknown model architecture: 'mllama'`, from
  both the CLI and the API), which is why `medgemma:4b` is the default.
  Also pull the chatbot's models:
  ```bash
  ollama pull qwen2.5:14b
  ollama pull nomic-embed-text
  ```
  **VRAM note:** on a 12GB GPU, `qwen2.5:14b` (~10GB) and `medgemma:4b`
  (~3GB) cannot both stay loaded at once — confirmed empirically, and not
  fixable by lowering `OLLAMA_CHAT_NUM_CTX`, since it's the base model
  weights that don't fit, not the context window. Ollama automatically
  swaps one out to load the other, which works correctly but costs a real
  ~8-13s reload delay whenever a patient switches between chatting and
  uploading a document. Not fixed here; the fix, if it matters for your
  demo, is a smaller chat model (7-8B class) — ask if you want that
  explored.
- Python 3.9+ (for the voice and translation services — see their own setup below)
- A MongoDB instance — one of:
  - Install [MongoDB Community Server](https://www.mongodb.com/try/download/community) locally
  - Use a free [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) cluster and copy its connection string
  - No install available? Run `npm run db:dev` from `backend/` — it starts a
    local MongoDB with no system install needed (data persists under
    `backend/.mongo-data/`). Leave that terminal running and use the default
    `MONGO_URI` in `.env.example`. Dev/demo convenience only, not for production.

## Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `MONGO_URI` — your local or Atlas connection string
- `JWT_SECRET` — replace with a long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

Then start it:

```bash
npm run dev
```

The API runs on `http://localhost:5000` by default.

Optional — seed a demo doctor account (`dr.sharma` / `doctor123`):

```bash
npm run seed:doctor
```

## Voice service setup

Optional but recommended — without it the app works fine, the mic button
just hides itself.

```bash
cd voice-service
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 8010
```

First real transcription downloads the Whisper model (~500MB, one-time).
See `voice-service/README.md` for the mock-mode fallback and design notes.
The Node backend finds it at `http://localhost:8010` by default
(`VOICE_SERVICE_URL` in `backend/.env`).

## Translation service setup

Required for non-English chat — without it, English visits work fine but
every other language will fail on every message (see
`translate-service/README.md`'s "Known gaps" for why this dependency is
harder than voice's optional one).

```bash
cd translate-service
python -m venv .venv
.venv\Scripts\activate        # macOS/Linux: source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
```

**Windows only** — install a C++ compiler before the next step (needed to
build `IndicTransToolkit`'s Cython extension; not needed on macOS/Linux):

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

```bash
pip install -r requirements.txt
```

IndicTrans2's models are **gated on Hugging Face** — create/log into an HF
account, click "Agree and access repository" on both
[indictrans2-en-indic-dist-200M](https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M)
and
[indictrans2-indic-en-dist-200M](https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M),
generate a token at https://huggingface.co/settings/tokens, then copy
`.env.example` to `.env` and set `HF_TOKEN` to it.

```bash
uvicorn app.main:app --port 8020
```

First real translation in each direction downloads that checkpoint
(~1GB each). See `translate-service/README.md` for the mock-mode
fallback, why IndicTrans2 was chosen over the easier-to-set-up NLLB-200,
and design notes. The Node backend finds this service at
`http://localhost:8020` by default (`TRANSLATE_SERVICE_URL` in
`backend/.env`).

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Opens on `http://localhost:5173`, proxying `/api` to the backend.

## Trying it out

1. Register a patient with any 14-digit ABHA ID (e.g. `12345678901234`) and a password.
2. From the patient dashboard, click **Start conversation** under "Talk to MedListen", optionally pick a language, and describe a symptom (e.g. "I've had a headache since yesterday") — either by typing or tapping the mic button — and watch the "Captured so far" panel fill in as you keep chatting. Picking a language other than English requires `translate-service` to be running (see above).
3. Fill in medical history and upload a document (PDF/JPEG/PNG/WEBP).
4. Register a doctor account, log in, and search by the same ABHA ID to view that patient's history, visit timeline, and documents.

## Notes on scope / security for this MVP

- ABHA authentication is **mocked** — patients set their own password against a
  self-declared ABHA ID rather than going through the real ABDM auth flow.
  Real ABDM integration (OTP-based auth via the ABDM gateway) is a separate,
  larger effort tracked for a later phase.
- Doctor registration is currently open/self-serve for demo convenience. In a
  real deployment, doctor accounts should be provisioned by a hospital admin.
- Uploaded files are stored on local disk under `backend/uploads/` (git-ignored).
  For production, use encrypted object storage (e.g. S3) instead.
- Known follow-ups: scanned-PDF OCR (needs a PDF→image render step),
  FHIR/ABDM push integration (from the full problem statement), and a
  fully local real-time voice option (chunked streaming through
  `faster-whisper`, to replace the Web Speech API's cloud dependency for
  browsers/contexts that need offline or fully private voice input).
- The chatbot's red-flag keyword list, AYUSH question set, and every
  non-English translation throughout (canned strings and IndicTrans2's
  live translation both) are all explicitly **not clinically or
  native-speaker validated** — same caveat as their source modules. Get
  both a clinician and native speakers of each language to review before
  this goes anywhere near a real patient.
- Non-English chat now has a **hard dependency on `translate-service`
  running** — a trade-off from moving translation out of the chat LLM and
  into its own service (see `translate-service/README.md`). If that
  service isn't running, English visits are unaffected but every other
  language will fail on every message rather than degrading gracefully.
- Voice transcription accuracy on real Indian-language speech (accents,
  code-switching, background noise) is unverified beyond a quick synthetic
  test with Windows' built-in text-to-speech — verify with a real
  microphone and real speech before treating it as demo-ready.
- The conversational history schema (`Visit`) is intentionally separate from
  the patient-edited `MedicalHistory` record: `Visit` is one immutable-ish
  episode per conversation (chief complaint, HPI, etc. for *that* visit),
  while `MedicalHistory` is the cumulative, patient-editable master record
  (allergies, family history, etc.). Both a completed `Visit` and a finished
  document extraction now feed new facts into `MedicalHistory` automatically
  (`backend/src/utils/mergeMedicalHistory.js`) — by appending deduplicated
  lines, never overwriting, so the patient's own edits (including
  deliberate deletions) are never silently reverted by a later merge. Chief
  complaint/HPI are deliberately excluded from this merge — those are
  episodic by nature, and the `Visit` timeline is already the source of
  truth for "what was each visit about"; overwriting the cumulative
  record's chief-complaint field with whatever the latest visit happened to
  be about would misrepresent it.
