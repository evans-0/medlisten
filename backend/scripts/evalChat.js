/**
 * Regression eval for the chat intake pipeline (backend/src/utils/chat/).
 *
 * Runs a fixed set of scripted conversations straight through
 * runTurnWithRetry() — the exact function routes/visits.js calls per turn —
 * bypassing HTTP/translation/Mongo entirely so this only needs Ollama
 * running. Each case asserts something concrete, mostly modeled on real
 * bugs found and fixed during development (never re-check these by hand
 * clicking through the UI again — run `node scripts/evalChat.js` instead).
 *
 * Non-zero exit code if anything fails, so this can gate a prompt change
 * before it ships, or be wired into CI later.
 */
require('dotenv').config();
const { runTurnWithRetry } = require('../src/utils/chat/turnRunner');
const { summarizeHistory } = require('../src/utils/chat/historySummary');
const { OPENING_QUESTIONS } = require('../src/utils/chat/prompts');
const { keywordRedFlagCheck } = require('../src/utils/chat/safety');

function applyResultToVisit(visit, result) {
  return {
    ...visit,
    chiefComplaint: result.history.chiefComplaint,
    hpi: result.history.hpi,
    pastMedicalSurgicalHistory: result.history.pastMedicalSurgicalHistory,
    currentMedications: result.history.currentMedications,
    drugAllergyHistory: result.history.drugAllergyHistory,
    familyHistory: result.history.familyHistory,
    personalHistory: result.history.personalHistory,
    reviewOfSystems: result.history.reviewOfSystems,
  };
}

// Replays one conversation: seeds the same fixed opening question the real
// app shows before any LLM call, then feeds each scripted patient answer
// through the real turn loop, carrying currentHistory forward exactly like
// visits.js does. Stops early on complete/red_flag, same as production.
async function runConversation(turns, opts) {
  let transcript = [{ role: 'assistant', text: OPENING_QUESTIONS.en }];
  let visit = {};
  const results = [];
  for (const patientText of turns) {
    transcript.push({ role: 'patient', text: patientText });

    // Mirrors visits.js exactly: the keyword net runs BEFORE the LLM and
    // short-circuits the turn if it matches — skipping this would make the
    // eval test the LLM's red-flag judgment in isolation, which is not what
    // a patient actually experiences (the keyword net is the first line of
    // defense specifically so an emergency isn't missed if the LLM misjudges).
    const matched = keywordRedFlagCheck(patientText);
    if (matched) {
      const result = {
        history: { ...visit, hpi: visit.hpi || {} },
        acknowledgement: null,
        nextQuestion: 'This sounds urgent — please alert staff immediately.',
        complete: true,
        redFlag: true,
        redFlagReason: `keyword match: '${matched}'`,
        triageLevel: 'emergency',
      };
      results.push(result);
      break;
    }

    const result = await runTurnWithRetry(transcript, { ...opts, currentHistory: summarizeHistory(visit) });
    transcript.push({ role: 'assistant', text: result.nextQuestion });
    visit = applyResultToVisit(visit, result);
    results.push(result);
    if (result.complete || result.redFlag) break;
  }
  return results;
}

// Same banned-phrase list DASHAVIDHA_INSTRUCTION itself gives the model —
// an AYUSH visit asking any of these is the exact bug fixed earlier
// (SOCRATES bleeding into an Ayurvedic visit).
const BANNED_SOCRATES_PHRASES = [
  'where exactly',
  'scale of 1 to 10',
  'scale from 1 to 10',
  'sharp or dull',
  'sharp, dull',
  'does it spread',
  'makes it better or worse',
  'makes the headache better or worse',
];

const CASES = [
  {
    name: 'captures a plain chief complaint',
    ayushMode: false,
    turns: ['I have a stomach ache'],
    check: (results) => {
      const cc = results[0].history.chiefComplaint;
      if (!cc || !/stomach/i.test(cc)) return `expected chiefComplaint to mention "stomach", got: ${JSON.stringify(cc)}`;
      return null;
    },
  },
  {
    name: 'AYUSH visit never asks SOCRATES-style questions',
    ayushMode: true,
    turns: ['I have a headache'],
    check: (results) => {
      const q = results[0].nextQuestion.toLowerCase();
      const hit = BANNED_SOCRATES_PHRASES.find((p) => q.includes(p));
      return hit ? `AYUSH visit's next_question used banned SOCRATES phrase "${hit}": "${results[0].nextQuestion}"` : null;
    },
  },
  {
    name: 'general visit does not repeat the exact same question twice in a row',
    ayushMode: false,
    turns: ['I have a headache', 'asdkfj random text', 'asdkfj random text'],
    check: (results) => {
      const q1 = results[1].nextQuestion.trim().toLowerCase();
      const q2 = results[2].nextQuestion.trim().toLowerCase();
      return q1 === q2 ? `repeated the exact same question twice in a row: "${results[2].nextQuestion}"` : null;
    },
  },
  {
    name: 'chest pain + breathlessness triggers emergency red flag',
    ayushMode: false,
    turns: ['I have chest pain and I cannot breathe properly'],
    check: (results) => {
      const r = results[0];
      if (!r.redFlag) return 'expected redFlag=true for chest pain + breathlessness';
      if (r.triageLevel !== 'emergency') return `expected triageLevel="emergency", got ${JSON.stringify(r.triageLevel)}`;
      return null;
    },
  },
  {
    name: 'medications and allergies stay separate when patient says no to both',
    ayushMode: false,
    turns: [
      'I have a mild headache since yesterday',
      'On my forehead',
      'Since yesterday morning',
      'A dull ache',
      'No it does not spread',
      'No other symptoms',
      'No it does not get worse at any time',
      'Nothing makes it better or worse',
      'About a 3 out of 10',
      'No, not taking any medicines and no allergies',
    ],
    check: (results) => {
      const last = results[results.length - 1];
      if (last.history.currentMedications.length || last.history.drugAllergyHistory.length) {
        return `expected both empty, got currentMedications=${JSON.stringify(last.history.currentMedications)} drugAllergyHistory=${JSON.stringify(last.history.drugAllergyHistory)}`;
      }
      return null;
    },
  },
  {
    name: 'next_question is never blank',
    ayushMode: false,
    turns: ['I feel dizzy sometimes'],
    check: (results) => {
      const blank = results.find((r) => !r.nextQuestion || !r.nextQuestion.trim());
      return blank ? 'nextQuestion was empty for at least one turn' : null;
    },
  },
];

async function main() {
  console.log(`Running ${CASES.length} chat eval cases against Ollama (this calls the real LLM — expect a few minutes)...\n`);
  let failures = 0;

  for (const testCase of CASES) {
    process.stdout.write(`- ${testCase.name} ... `);
    try {
      const results = await runConversation(testCase.turns, { ayushMode: testCase.ayushMode });
      const failure = testCase.check(results);
      if (failure) {
        failures += 1;
        console.log('FAIL');
        console.log(`    ${failure}`);
      } else {
        console.log('PASS');
      }
    } catch (err) {
      failures += 1;
      console.log('ERROR');
      console.log(`    ${err.message}`);
    }
  }

  console.log(`\n${CASES.length - failures}/${CASES.length} passed.`);
  process.exit(failures ? 1 : 0);
}

main();
