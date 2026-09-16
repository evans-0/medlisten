/**
 * Regenerates MedicalHistory.overallSummary — a short, doctor-facing
 * narrative synthesized from EVERYTHING on file for a patient (the
 * cumulative raw fields mergeMedicalHistory.js maintains, every visit's
 * chief complaint, and every extracted document) — not just whatever
 * triggered this particular run.
 *
 * Deliberately regenerates from the full raw source every time, rather
 * than feeding the model its own previous summary and asking for an
 * update: repeated summarize-the-summary passes drift and lose detail over
 * many iterations, and the raw fields are cheap to re-read in full (a
 * single patient's history is nowhere near context-window scale), so
 * there's no real cost to always re-deriving instead of patching.
 *
 * Called fire-and-forget (not awaited) from routes/visits.js and
 * routes/patient.js right after a visit/document merge — this is a
 * "nice to have" enrichment on top of an already-durable raw record, so a
 * failure here is logged and swallowed rather than failing the request
 * that triggered it.
 */
const MedicalHistory = require('../models/MedicalHistory');
const Visit = require('../models/Visit');
const Document = require('../models/Document');

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'qwen2.5:14b';
const SUMMARY_TIMEOUT_MS = Number(process.env.OLLAMA_SUMMARY_TIMEOUT_MS) || 60000;

async function callOllama(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS);
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CHAT_MODEL,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Ollama returned ${res.status}: ${body}`);
    }
    const data = await res.json();
    return (data.message?.content || '').trim();
  } finally {
    clearTimeout(timeout);
  }
}

// Same field set as DASHAVIDHA_INSTRUCTION in prompts.js — kept here as the
// canonical label mapping so this reads consistently with what the chat
// itself calls these during an AYUSH visit.
const AYUSH_FIELD_LABELS = {
  prakriti: 'Prakriti (constitution)',
  vikriti: 'Vikriti (current imbalance)',
  sara: 'Sara (tissue vitality)',
  samhanana: 'Samhanana (build)',
  pramana: 'Pramana (proportions)',
  satmya: 'Satmya (adaptability)',
  sattva: 'Sattva (mental strength)',
  aharaShakti: 'Aharashakti (digestive capacity)',
  vyayamaShakti: 'Vyayamashakti (exercise capacity)',
  vaya: 'Vaya (age/rate of aging)',
  nidana: 'Nidana (causative factors)',
};

function buildSummaryPrompt({ history, visits, documents }) {
  const completedVisits = visits.filter((v) => v.status === 'completed');

  const visitLines =
    completedVisits
      .map((v) => {
        const date = new Date(v.createdAt).toLocaleDateString();
        const flags = [v.triageLevel, v.redFlag ? 'URGENT' : null].filter(Boolean).join(', ');
        return `- ${date}: ${v.chiefComplaint || 'visit'}${flags ? ` (${flags})` : ''}`;
      })
      .join('\n') || 'None recorded.';

  const docLines =
    documents
      .filter((d) => d.ocrStatus === 'completed' && d.extracted)
      .map((d) => {
        const date = new Date(d.createdAt).toLocaleDateString();
        const parts = [];
        if (d.extracted.diagnoses?.length) parts.push(`diagnoses: ${d.extracted.diagnoses.join(', ')}`);
        if (d.extracted.medications?.length) parts.push(`medications: ${d.extracted.medications.map((m) => m.name).join(', ')}`);
        return `- ${date} (${d.category}): ${parts.join('; ') || 'no structured data extracted'}`;
      })
      .join('\n') || 'None uploaded.';

  // The most recent AYUSH visit with an actual Dashavidha Pariksha assessment
  // on file — Prakriti especially is meant to be a stable constitutional
  // trait, not something that changes visit to visit, so the latest
  // completed assessment is the representative one, not an average or a
  // list across every AYUSH visit ever taken.
  const latestAyush = [...completedVisits]
    .reverse()
    .find((v) => v.ayushMode && v.ayush && Object.values(v.ayush).some((val) => val));

  const ayushLines = latestAyush
    ? Object.entries(AYUSH_FIELD_LABELS)
        .filter(([key]) => latestAyush.ayush[key])
        .map(([key, label]) => `${label}: ${latestAyush.ayush[key]}`)
        .join('\n')
    : null;

  const ayushSection = ayushLines
    ? `\nDASHAVIDHA PARIKSHA ASSESSMENT ON FILE (from ${new Date(latestAyush.createdAt).toLocaleDateString()}):\n${ayushLines}\n`
    : '';

  return `You are summarizing a patient's cumulative medical record for a doctor about to see them, so they can get oriented in a few seconds before the consultation.

Rules:
- Plain prose, 2-4 short sentences (up to 5-6 if an AYUSH assessment is included below). No headers, no bullet points, no markdown.
- Only use what's given below — never invent a condition, medication, dosha reading, or date not present here.
- If almost nothing is on file, say that plainly rather than padding with generic text.
- Prioritize: ongoing/chronic issues, allergies, current medications, and a one-line sense of the visit pattern (frequency, anything urgent).
${ayushLines ? '- A Dashavidha Pariksha assessment is on file below — this patient has an AYUSH visit history, so weave the constitutional picture (Prakriti/Vikriti and any other filled factors) into the summary in genuine Ayurvedic terms, not just translated into Western language. A doctor reviewing this may be an AYUSH practitioner who needs that framing directly usable, not diluted.' : ''}

CUMULATIVE RECORD ON FILE:
Past medical history: ${history.pastMedicalHistory || 'None recorded.'}
Past surgical history: ${history.pastSurgicalHistory || 'None recorded.'}
Drug/allergy history: ${history.drugAllergyHistory || 'None recorded.'}
Current medications: ${(history.currentMedications || []).join(', ') || 'None recorded.'}
Family history: ${history.familyHistory || 'None recorded.'}
Personal history: ${history.personalHistory || 'None recorded.'}
Review of systems: ${history.reviewOfSystems || 'None recorded.'}
${ayushSection}
VISIT HISTORY (chief complaints over time, oldest first):
${visitLines}

DOCUMENTS ON FILE:
${docLines}

Write the summary now.`;
}

async function generateOverallSummary(patientId) {
  const [history, visits, documents] = await Promise.all([
    MedicalHistory.findOne({ patient: patientId }),
    Visit.find({ patient: patientId }).sort({ createdAt: 1 }),
    Document.find({ patient: patientId }).sort({ createdAt: 1 }),
  ]);
  if (!history) return;

  try {
    const summary = await callOllama(buildSummaryPrompt({ history, visits, documents }));
    if (summary) {
      history.overallSummary = summary;
      await history.save();
    }
  } catch (err) {
    console.error('[overallSummary] generation failed:', err.message);
  }
}

module.exports = { generateOverallSummary };
