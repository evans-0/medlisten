/**
 * Feeds newly-captured data from a completed chat Visit or a finished
 * document extraction into the patient's cumulative MedicalHistory record.
 *
 * Design decisions:
 * - MedicalHistory's fields are free-text (patient-editable via a
 *   textarea), while Visit/Document's equivalent fields are structured
 *   arrays. Rather than overwrite, each merge APPENDS new, deduplicated
 *   lines — a patient's own edits (including deliberate deletions) are
 *   never silently reverted by a later merge.
 * - Merges run ONCE, at the moment a Visit transitions into 'completed' or
 *   a Document's extraction transitions into 'completed' — not a periodic
 *   recompute from all history, which would keep re-adding anything the
 *   patient had intentionally removed.
 * - chief complaint / HPI are deliberately NOT merged in from a Visit —
 *   those are episodic by nature ("why did you come in today"), and
 *   overwriting a cumulative record's chief-complaint field with whatever
 *   the latest visit happened to be about would misrepresent it. The Visit
 *   timeline is the source of truth for episodic complaints; MedicalHistory
 *   stays for genuinely cumulative facts (allergies, family history, etc.).
 * - Document-derived diagnoses/medications/procedures go into
 *   pastMedicalHistory/pastSurgicalHistory as dated lines (e.g. "Diagnosed
 *   12-09-2026 (from uploaded document): ...") rather than into
 *   currentMedications — a scanned prescription doesn't reliably tell us
 *   whether that course is still ongoing, so treating it as "current"
 *   would overclaim. The Documents tab already shows the full structured
 *   extraction (dosage, confidence, etc.) for anything needing that detail.
 */
const MedicalHistory = require('../models/MedicalHistory');

function appendUniqueLines(existingText, newLines) {
  const existing = (existingText || '').trim();
  const existingLower = existing.split('\n').map((l) => l.trim().toLowerCase());
  const toAdd = (newLines || [])
    .map((l) => (l || '').trim())
    .filter((l) => l && !existingLower.includes(l.toLowerCase()));
  if (toAdd.length === 0) return existing;
  return existing ? `${existing}\n${toAdd.join('\n')}` : toAdd.join('\n');
}

function mergeUniqueArray(existingArray, newItems) {
  const existing = existingArray || [];
  const existingLower = existing.map((i) => i.trim().toLowerCase());
  const toAdd = (newItems || [])
    .map((i) => (i || '').trim())
    .filter((i) => i && !existingLower.includes(i.toLowerCase()));
  return toAdd.length ? [...existing, ...toAdd] : existing;
}

async function getOrCreateHistory(patientId) {
  let history = await MedicalHistory.findOne({ patient: patientId });
  if (!history) history = new MedicalHistory({ patient: patientId });
  return history;
}

async function mergeVisitIntoMedicalHistory(patientId, visit) {
  const history = await getOrCreateHistory(patientId);

  history.pastMedicalHistory = appendUniqueLines(history.pastMedicalHistory, visit.pastMedicalSurgicalHistory);
  history.drugAllergyHistory = appendUniqueLines(history.drugAllergyHistory, visit.drugAllergyHistory);
  history.familyHistory = appendUniqueLines(history.familyHistory, visit.familyHistory);
  history.reviewOfSystems = appendUniqueLines(history.reviewOfSystems, visit.reviewOfSystems);
  if (visit.personalHistory) {
    history.personalHistory = appendUniqueLines(history.personalHistory, [visit.personalHistory]);
  }
  history.currentMedications = mergeUniqueArray(history.currentMedications, visit.currentMedications);

  await history.save();
  return history;
}

async function mergeDocumentIntoMedicalHistory(patientId, document) {
  const extracted = document.extracted;
  if (!extracted) return null;

  const history = await getOrCreateHistory(patientId);
  const dateLabel = extracted.documentDate || new Date(document.createdAt).toLocaleDateString();

  if (extracted.diagnoses?.length) {
    const lines = extracted.diagnoses.map((d) => `Diagnosed ${dateLabel} (from uploaded document): ${d}`);
    history.pastMedicalHistory = appendUniqueLines(history.pastMedicalHistory, lines);
  }

  if (extracted.medications?.length) {
    const lines = extracted.medications.map((m) => {
      const parts = [m.name, m.dosage, m.frequency].filter(Boolean).join(' — ');
      return `Prescribed ${dateLabel} (from uploaded document): ${parts}`;
    });
    history.pastMedicalHistory = appendUniqueLines(history.pastMedicalHistory, lines);
  }

  if (extracted.proceduresSurgeries?.length) {
    const lines = extracted.proceduresSurgeries.map((p) => `${dateLabel} (from uploaded document): ${p}`);
    history.pastSurgicalHistory = appendUniqueLines(history.pastSurgicalHistory, lines);
  }

  await history.save();
  return history;
}

module.exports = { mergeVisitIntoMedicalHistory, mergeDocumentIntoMedicalHistory };
