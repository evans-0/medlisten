/**
 * Thin client for the local translation microservice (translate-service/,
 * AI4Bharat's IndicTrans2 running on CPU).
 *
 * This exists so the chat's clinical-reasoning LLM (qwen2.5:14b) can work
 * entirely in English — its strongest language for both clinical reasoning
 * and strict JSON-schema following — while the patient still converses
 * in their own language. The language switch happens at exactly two
 * boundary points: the patient's message going in (their language ->
 * English) and the assistant's question coming out (English -> their
 * language). See translate-service/README.md for why this replaced the
 * earlier design, where qwen2.5:14b was asked to converse directly in the
 * target language itself.
 */
const TRANSLATE_SERVICE_URL = process.env.TRANSLATE_SERVICE_URL || 'http://localhost:8020';
const TRANSLATE_TIMEOUT_MS = Number(process.env.TRANSLATE_TIMEOUT_MS) || 15000;

async function translateOnce(text, source, target) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATE_TIMEOUT_MS);
  try {
    const res = await fetch(`${TRANSLATE_SERVICE_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source, target }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`translate-service returned ${res.status}: ${body}`);
    }
    const data = await res.json();
    return data.translation;
  } finally {
    clearTimeout(timeout);
  }
}

async function translate(text, source, target) {
  if (source === target || !text.trim()) return text;

  try {
    return await translateOnce(text, source, target);
  } catch (err) {
    // A single transient blip (network hiccup, translate-service briefly
    // overloaded) shouldn't fail the whole chat turn — retry once before
    // giving up. A genuine outage throws again here and propagates as usual.
    console.warn('[translate] request failed (%s) — retrying once', err.message);
    return translateOnce(text, source, target);
  }
}

function toEnglish(text, sourceLang) {
  return translate(text, sourceLang, 'en');
}

function fromEnglish(text, targetLang) {
  return translate(text, 'en', targetLang);
}

module.exports = { toEnglish, fromEnglish };
