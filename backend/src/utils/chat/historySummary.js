/**
 * Extracted out of routes/visits.js so the eval harness (scripts/evalChat.js)
 * exercises the exact same "what does the model get told was already
 * captured" logic production uses — an eval that quietly drifted from prod
 * behavior would give false confidence.
 */

/** Plain-text summary of what's already been captured, so the model doesn't re-ask for it. */
function summarizeHistory(visit) {
  const lines = [];
  if (visit.chiefComplaint) lines.push(`chief_complaint: ${visit.chiefComplaint}`);
  if (visit.hpi) {
    for (const [key, val] of Object.entries(visit.hpi.toObject ? visit.hpi.toObject() : visit.hpi)) {
      if (!val || (Array.isArray(val) && val.length === 0)) continue;
      lines.push(`hpi.${key}: ${Array.isArray(val) ? val.join(', ') : val}`);
    }
  }
  if (visit.pastMedicalSurgicalHistory?.length) lines.push(`past_medical_surgical_history: ${visit.pastMedicalSurgicalHistory.join(', ')}`);
  if (visit.currentMedications?.length) lines.push(`current_medications: ${visit.currentMedications.join(', ')}`);
  if (visit.drugAllergyHistory?.length) lines.push(`drug_allergy_history: ${visit.drugAllergyHistory.join(', ')}`);
  if (visit.familyHistory?.length) lines.push(`family_history: ${visit.familyHistory.join(', ')}`);
  if (visit.personalHistory) lines.push(`personal_history: ${visit.personalHistory}`);
  if (visit.reviewOfSystems?.length) lines.push(`review_of_systems: ${visit.reviewOfSystems.join(', ')}`);
  return lines.length ? lines.join('\n') : null;
}

module.exports = { summarizeHistory };
