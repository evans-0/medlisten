/**
 * Wraps runTurn() to handle "empty" turns: schema-valid, but with no
 * next_question and not marked complete either — nothing for the UI to show
 * and nothing for the interview to do next.
 *
 * Ported from a teammate's converse-module (SIH2026/converse-module/app/turn_runner.py),
 * which found this to be a real, repeatable local-model quirk (not a rare
 * edge case) — smaller models are more likely to leave next_question blank
 * without setting complete=true than a larger cloud model is. Retries once
 * with an explicit correction (RETRY_HINT), since retrying with an identical
 * prompt at low temperature gives the model little reason to answer
 * differently. If it's still empty after that, falls back to a generic
 * continuation question rather than stalling the conversation.
 */
const { runTurn: runTurnRaw } = require('./ollamaChat');
const { RETRY_HINT } = require('./prompts');

// The chat LLM always works in English (see prompts.js) — visits.js
// translates whatever nextQuestion comes back (this fallback included) into
// the patient's language afterward, so a single English string covers every
// language rather than needing one canned translation per language here.
const FALLBACK_QUESTION_EN = 'Sorry, could you tell me a bit more about that?';

function isEmptyTurn(result) {
  return !result.complete && !result.nextQuestion;
}

async function runTurnWithRetry(transcript, opts) {
  let result;
  try {
    result = await runTurnRaw(transcript, opts);
  } catch (err) {
    // Ollama's format:'json' grammar-constrains output but doesn't guarantee
    // it — a response cut off by the context/prediction budget (more likely
    // as a transcript grows) lands here as a JSON.parse failure in
    // schema.js, and a real Ollama/network hiccup lands here too. Either way
    // this was previously an immediate, un-retried 502 straight to the
    // patient ("Message failed to send") even though a fresh sampling
    // attempt at the same prompt usually just works. A genuine outage will
    // throw again below and propagate normally.
    console.warn('[chat/turnRunner] turn threw (%s) — retrying once', err.message);
    result = await runTurnRaw(transcript, opts);
  }
  if (isEmptyTurn(result)) {
    console.warn('[chat/turnRunner] empty turn #1 — retrying with correction hint');
    result = await runTurnRaw(transcript, { ...opts, retryHint: RETRY_HINT });
    if (isEmptyTurn(result)) {
      console.warn('[chat/turnRunner] empty turn twice in a row — falling back to generic question');
      result = { ...result, nextQuestion: FALLBACK_QUESTION_EN };
    }
  }
  return result;
}

module.exports = { runTurnWithRetry };
