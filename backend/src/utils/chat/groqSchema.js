/**
 * JSON Schema for Groq's Strict Mode structured outputs (constrained
 * decoding — the model literally cannot emit a response that doesn't match
 * this shape, unlike Ollama's format:'json' which only grammar-constrains
 * general JSON-ness and still relies on the prompt for the actual shape).
 *
 * Mirrors exactly what schema.js's parseTurnResult() reads (same snake_case
 * keys, same nesting) — parseTurnResult()'s lenient re-nesting/coercion
 * logic still runs on this output too, harmlessly, since it was built for
 * local models that don't have this guarantee.
 *
 * Strict mode's rules (see https://console.groq.com/docs/structured-outputs):
 * every property must be in `required`, every object needs
 * `additionalProperties: false`, and an optional field is expressed as a
 * union with null rather than being omitted from `required`.
 */

const nullableString = { type: ['string', 'null'] };
const stringArray = { type: 'array', items: { type: 'string' } };

const HPI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['site', 'onset', 'character', 'radiation', 'associated_symptoms', 'timing', 'exacerbating_relieving', 'severity'],
  properties: {
    site: nullableString,
    onset: nullableString,
    character: nullableString,
    radiation: nullableString,
    associated_symptoms: stringArray,
    timing: nullableString,
    exacerbating_relieving: nullableString,
    severity: nullableString,
  },
};

const AYUSH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'prakriti', 'vikriti', 'sara', 'samhanana', 'pramana',
    'satmya', 'sattva', 'ahara_shakti', 'vyayama_shakti', 'vaya', 'nidana',
  ],
  properties: {
    prakriti: nullableString,
    vikriti: nullableString,
    sara: nullableString,
    samhanana: nullableString,
    pramana: nullableString,
    satmya: nullableString,
    sattva: nullableString,
    ahara_shakti: nullableString,
    vyayama_shakti: nullableString,
    vaya: nullableString,
    nidana: nullableString,
  },
};

const TURN_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['history', 'acknowledgement', 'next_question', 'complete', 'red_flag', 'red_flag_reason', 'triage_level'],
  properties: {
    history: {
      type: 'object',
      additionalProperties: false,
      required: [
        'chief_complaint', 'hpi', 'past_medical_surgical_history', 'current_medications',
        'drug_allergy_history', 'family_history', 'personal_history', 'review_of_systems', 'ayush',
      ],
      properties: {
        chief_complaint: nullableString,
        hpi: HPI_SCHEMA,
        past_medical_surgical_history: stringArray,
        current_medications: stringArray,
        drug_allergy_history: stringArray,
        family_history: stringArray,
        personal_history: nullableString,
        review_of_systems: stringArray,
        // Nullable OBJECT (not just a nullable string) — only anyOf, not a
        // plain `type` union, can express "this object or null" in JSON
        // Schema.
        ayush: { anyOf: [AYUSH_SCHEMA, { type: 'null' }] },
      },
    },
    acknowledgement: nullableString,
    next_question: { type: 'string' },
    complete: { type: 'boolean' },
    red_flag: { type: 'boolean' },
    red_flag_reason: nullableString,
    triage_level: {
      anyOf: [{ type: 'string', enum: ['routine', 'soon', 'urgent', 'emergency'] }, { type: 'null' }],
    },
  },
};

module.exports = { TURN_RESULT_SCHEMA };
