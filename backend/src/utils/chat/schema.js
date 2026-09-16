/**
 * Lenient parsing + normalization of a chat turn's raw JSON output.
 *
 * Ported from a teammate's converse-module (SIH2026/converse-module/app/schema.py,
 * `TurnResult.from_raw_lenient`), which exists specifically because smaller/
 * local models reliably do a few predictable things wrong: flattening the
 * "history" object's fields onto the root, or emitting "" / "none" instead
 * of an empty list. Fixing these here means one bad structural quirk never
 * throws away an otherwise-good turn.
 */

const HISTORY_FIELDS = [
  'chief_complaint',
  'hpi',
  'past_medical_surgical_history',
  'current_medications',
  'drug_allergy_history',
  'family_history',
  'personal_history',
  'review_of_systems',
  'ayush',
];

const HPI_FIELDS = [
  'site',
  'onset',
  'character',
  'radiation',
  'associated_symptoms',
  'timing',
  'exacerbating_relieving',
  'severity',
];

const AYUSH_FIELDS = [
  'prakriti',
  'vikriti',
  'sara',
  'samhanana',
  'pramana',
  'satmya',
  'sattva',
  'ahara_shakti',
  'vyayama_shakti',
  'vaya',
  'nidana',
];

const LIST_FIELDS = [
  'past_medical_surgical_history',
  'current_medications',
  'drug_allergy_history',
  'family_history',
  'review_of_systems',
];

function stripCodeFence(content) {
  const trimmed = content.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  const lines = trimmed.split('\n');
  if (lines[0].startsWith('```')) lines.shift();
  if (lines.length && lines[lines.length - 1].startsWith('```')) lines.pop();
  return lines.join('\n').trim();
}

function reNestFlattenedFields(data) {
  if (!data.history) {
    const history = {};
    for (const field of HISTORY_FIELDS) {
      if (field in data) {
        history[field] = data[field];
        delete data[field];
      }
    }
    data.history = history;
  }

  if (data.history && typeof data.history === 'object') {
    const h = data.history;

    let hpi = typeof h.hpi === 'object' && h.hpi ? h.hpi : {};
    let foundFlatHpi = false;
    for (const field of HPI_FIELDS) {
      if (field in data) {
        hpi[field] = data[field];
        delete data[field];
        foundFlatHpi = true;
      }
    }
    if (foundFlatHpi) h.hpi = hpi;

    let ayush = typeof h.ayush === 'object' && h.ayush ? h.ayush : {};
    let foundFlatAyush = false;
    for (const field of AYUSH_FIELDS) {
      if (field in data) {
        ayush[field] = data[field];
        delete data[field];
        foundFlatAyush = true;
      }
    }
    if (foundFlatAyush) h.ayush = ayush;

    for (const field of LIST_FIELDS) {
      const v = h[field];
      if (v === '' || v === 'none' || v === 'None' || v == null) {
        h[field] = [];
      } else if (typeof v === 'string') {
        h[field] = [v];
      }
    }

    if (h.hpi && typeof h.hpi === 'object') {
      const assoc = h.hpi.associated_symptoms;
      if (assoc === '' || assoc === 'none' || assoc === 'None' || assoc == null) {
        h.hpi.associated_symptoms = [];
      } else if (typeof assoc === 'string') {
        h.hpi.associated_symptoms = [assoc];
      }
    }
  }

  return data;
}

function asStringOrNull(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function asStringArray(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
}

const TRIAGE_LEVELS = new Set(['routine', 'soon', 'urgent', 'emergency']);

function asTriageLevel(v) {
  return TRIAGE_LEVELS.has(v) ? v : null;
}

/** Parses + normalizes a raw LLM chat response string into our turn-result shape. */
function parseTurnResult(rawContent) {
  const content = stripCodeFence(rawContent);
  const data = reNestFlattenedFields(JSON.parse(content));
  const h = data.history && typeof data.history === 'object' ? data.history : {};
  const hpiRaw = h.hpi && typeof h.hpi === 'object' ? h.hpi : {};
  const ayushRaw = h.ayush && typeof h.ayush === 'object' ? h.ayush : null;

  return {
    history: {
      chiefComplaint: asStringOrNull(h.chief_complaint),
      hpi: {
        site: asStringOrNull(hpiRaw.site),
        onset: asStringOrNull(hpiRaw.onset),
        character: asStringOrNull(hpiRaw.character),
        radiation: asStringOrNull(hpiRaw.radiation),
        associatedSymptoms: asStringArray(hpiRaw.associated_symptoms),
        timing: asStringOrNull(hpiRaw.timing),
        exacerbatingRelieving: asStringOrNull(hpiRaw.exacerbating_relieving),
        severity: asStringOrNull(hpiRaw.severity),
      },
      pastMedicalSurgicalHistory: asStringArray(h.past_medical_surgical_history),
      currentMedications: asStringArray(h.current_medications),
      drugAllergyHistory: asStringArray(h.drug_allergy_history),
      familyHistory: asStringArray(h.family_history),
      personalHistory: asStringOrNull(h.personal_history),
      reviewOfSystems: asStringArray(h.review_of_systems),
      ayush: ayushRaw
        ? {
            prakriti: asStringOrNull(ayushRaw.prakriti),
            vikriti: asStringOrNull(ayushRaw.vikriti),
            sara: asStringOrNull(ayushRaw.sara),
            samhanana: asStringOrNull(ayushRaw.samhanana),
            pramana: asStringOrNull(ayushRaw.pramana),
            satmya: asStringOrNull(ayushRaw.satmya),
            sattva: asStringOrNull(ayushRaw.sattva),
            aharaShakti: asStringOrNull(ayushRaw.ahara_shakti),
            vyayamaShakti: asStringOrNull(ayushRaw.vyayama_shakti),
            vaya: asStringOrNull(ayushRaw.vaya),
            nidana: asStringOrNull(ayushRaw.nidana),
          }
        : null,
    },
    acknowledgement: asStringOrNull(data.acknowledgement),
    nextQuestion: typeof data.next_question === 'string' ? data.next_question.trim() : '',
    complete: typeof data.complete === 'boolean' ? data.complete : false,
    redFlag: typeof data.red_flag === 'boolean' ? data.red_flag : false,
    redFlagReason: asStringOrNull(data.red_flag_reason),
    triageLevel: asTriageLevel(data.triage_level),
  };
}

module.exports = { parseTurnResult };
