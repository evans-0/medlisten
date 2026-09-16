/**
 * Shared pacing for every outbound Groq call, chat and vision(OCR) alike —
 * both draw from the SAME account-wide token-per-minute budget, so pacing
 * them independently (one gate per feature) would still let the two
 * features' calls stack up and blow the shared limit between them. One
 * shared FIFO gate here is what actually keeps total usage under budget
 * regardless of which feature is calling.
 *
 * See ollamaChat.js's header comment for the full story on why this exists
 * (a live 429 at Groq's free-tier 7000 input-tokens/minute ceiling for
 * qwen/qwen3.8-27b) and ocr.js for the vision use of the same model/budget.
 */
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_MIN_INTERVAL_MS = Number(process.env.GROQ_MIN_INTERVAL_MS) || 16000;

let groqScheduleTail = Promise.resolve(0); // resolves to the timestamp the last slot was granted

function waitForGroqSlot() {
  const slot = groqScheduleTail.then((prevSlotAt) => {
    const now = Date.now();
    const slotAt = Math.max(now, prevSlotAt + GROQ_MIN_INTERVAL_MS);
    const delay = slotAt - now;
    return new Promise((resolve) => setTimeout(() => resolve(slotAt), delay));
  });
  groqScheduleTail = slot;
  return slot;
}

module.exports = { GROQ_API_KEY, GROQ_BASE_URL, waitForGroqSlot };
