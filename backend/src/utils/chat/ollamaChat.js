/**
 * Runs one conversational-intake turn against a chat model — either a local
 * Ollama model (qwen2.5:14b by default) or, when GROQ_API_KEY is set,
 * Groq's cloud API instead. Local-only concerns (num_ctx, keep_alive) are
 * ported from a teammate's converse-module (SIH2026/converse-module/app/
 * ollama_llm.py) for the same reasons documented there: a growing
 * transcript can silently exceed Ollama's VRAM-heuristic default context
 * window, and the default 5-minute keep_alive means a real clinic's natural
 * gaps between patients routinely eat a cold-reload on the next patient's
 * first message.
 *
 * The Groq path exists because local inference on a 12GB laptop GPU proved
 * unreliable for anything past 14B-class models — CPU-offloaded larger
 * models measured 15-200+ seconds per turn with no way to predict which,
 * and even the 14B model that fits fully in VRAM saw real per-turn latency
 * swing from ~15s to over 3 minutes depending on message complexity. Groq's
 * dedicated LPU hardware is both faster and far more consistent, and its
 * Strict Mode structured outputs (groqSchema.js) give a stronger JSON
 * guarantee than Ollama's format:'json' ever did — constrained decoding
 * that cannot produce an invalid shape, vs. grammar-constrained-but-still-
 * prompt-dependent local output.
 *
 * RAG retrieval (retrieveGuideline/retrieveFromCorpus) stays fully local
 * either way — only the final chat completion call moves to the cloud when
 * GROQ_API_KEY is present; embeddings still run through local Ollama
 * (nomic-embed-text), so Ollama must still be running for RAG even in Groq
 * mode.
 */
const { buildSystemInstruction, renderTranscript } = require('./prompts');
const { parseTurnResult } = require('./schema');
const { retrieveGuideline, retrieveFromCorpus } = require('./rag');
const { TURN_RESULT_SCHEMA } = require('./groqSchema');
const { GROQ_API_KEY, GROQ_BASE_URL, waitForGroqSlot } = require('../groqPacer');

// Bulk-ingested corpora (scripts/ingestRagCorpus.js + embedRagCorpus.js) to
// additionally ground a visit's questions in, alongside guidelines.json's
// curated match — each is a no-op until that corpus has actually been
// ingested/embedded (see rag.js's loadCorpus), so wiring in a corpus name
// ahead of having real source files for it is safe.
const AYUSH_CORPUS_NAME = 'ayush';
const GENERAL_CORPUS_NAME = 'general';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'qwen2.5:14b';
const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_CHAT_NUM_CTX) || 8192;
const OLLAMA_KEEP_ALIVE = process.env.OLLAMA_CHAT_KEEP_ALIVE || '30m';
const RUN_TURN_TIMEOUT_MS = Number(process.env.OLLAMA_CHAT_TIMEOUT_MS) || 120000;
// Unset by default (omit `think` entirely -> whatever the model's own
// default is). Only reasoning-capable models (e.g. qwen3) look at this at
// all; harmless no-op for models like qwen2.5 that don't support it.
const OLLAMA_CHAT_THINK = process.env.OLLAMA_CHAT_THINK;

const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'qwen/qwen3.8-27b';

// Pacing is shared with ocr.js (groqPacer.js) — chat and vision(OCR) calls
// draw from the SAME account-wide Groq token budget, so they need to share
// one gate, not pace independently. See groqPacer.js and this file's header
// comment for the full story (a live 429 at the free tier's 7000
// input-tokens/minute ceiling for qwen/qwen3.8-27b).
async function callGroq(messages, timeoutMs) {
  await waitForGroqSlot();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_CHAT_MODEL,
        messages,
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'turn_result', strict: true, schema: TURN_RESULT_SCHEMA },
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Groq returned an error (${res.status}): ${body}`);
    }
    const body = await res.json();
    // Normalized to the same { message: { content } } shape callOllama
    // returns, so runTurn() below doesn't need to know which backend answered.
    return { message: { content: body.choices?.[0]?.message?.content || '' } };
  } finally {
    clearTimeout(timeout);
  }
}

async function callOllama(messages, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const requestBody = {
      model: OLLAMA_CHAT_MODEL,
      messages,
      stream: false,
      format: 'json',
      options: { temperature: 0.3, num_ctx: OLLAMA_NUM_CTX },
      keep_alive: OLLAMA_KEEP_ALIVE,
    };
    if (OLLAMA_CHAT_THINK !== undefined) requestBody.think = OLLAMA_CHAT_THINK === 'true';
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama returned an error (${res.status}): ${body}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {{role: 'patient'|'assistant', text: string}[]} transcript English-only — translation happens in visits.js before/after this call.
 * @param {{ ayushMode?: boolean, retryHint?: string|null, currentHistory?: string|null }} opts
 */
async function runTurn(transcript, { ayushMode = false, retryHint = null, currentHistory = null } = {}) {
  const clinicalGuideline = await retrieveGuideline(transcript);
  const corpusExcerpts = await retrieveFromCorpus(ayushMode ? AYUSH_CORPUS_NAME : GENERAL_CORPUS_NAME, transcript);
  const systemInstruction = buildSystemInstruction({
    ayushMode,
    retryHint,
    clinicalGuideline,
    corpusExcerpts,
    currentHistory,
  });

  const messages = [
    { role: 'system', content: systemInstruction },
    { role: 'user', content: renderTranscript(transcript) },
  ];
  const body = GROQ_API_KEY
    ? await callGroq(messages, RUN_TURN_TIMEOUT_MS)
    : await callOllama(messages, RUN_TURN_TIMEOUT_MS);

  return parseTurnResult(body.message?.content || '');
}

/**
 * Fire-and-forget warmup so the model is already loaded before a real
 * patient's first message — avoids the cold-start latency spike a fresh
 * Ollama/model load would otherwise put on that first turn.
 */
async function warmup() {
  const messages = [
    { role: 'system', content: buildSystemInstruction({ ayushMode: false }) },
    { role: 'user', content: '(warmup ping — not a real patient turn)' },
  ];
  try {
    if (GROQ_API_KEY) {
      await callGroq(messages, 60000);
      console.log(`[chat/groq] warmup OK (model=${GROQ_CHAT_MODEL})`);
    } else {
      await callOllama(messages, 240000);
      console.log(`[chat/ollama] warmup OK (model=${OLLAMA_CHAT_MODEL})`);
    }
  } catch (err) {
    console.error('[chat] warmup failed (will retry on first real turn):', err.message);
  }
}

module.exports = { runTurn, warmup };
