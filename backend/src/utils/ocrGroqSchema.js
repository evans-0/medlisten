/**
 * JSON Schema for Groq's Strict Mode structured outputs, matching the exact
 * shape extractionPrompt.js's instruction asks for and ocr.js's
 * normalizeExtraction() reads. Same rationale as chat/groqSchema.js:
 * constrained decoding guarantees this shape outright rather than relying
 * on the prompt alone, and every strict-mode object needs
 * `additionalProperties: false` with every property listed in `required`
 * (optional fields become a `[type, "null"]` union instead of being
 * omitted).
 */

const nullableString = { type: ['string', 'null'] };
const stringArray = { type: 'array', items: { type: 'string' } };

const VITALS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['blood_pressure', 'pulse_rate', 'temperature', 'respiratory_rate', 'spo2'],
  properties: {
    blood_pressure: nullableString,
    pulse_rate: nullableString,
    temperature: nullableString,
    respiratory_rate: nullableString,
    spo2: nullableString,
  },
};

const MEDICATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'dosage', 'frequency', 'confidence'],
  properties: {
    name: { type: 'string' },
    dosage: nullableString,
    frequency: nullableString,
    confidence: { type: 'number' },
  },
};

const INVESTIGATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'value', 'unit', 'reference_range', 'abnormal', 'confidence'],
  properties: {
    name: { type: 'string' },
    value: nullableString,
    unit: nullableString,
    reference_range: nullableString,
    abnormal: { type: ['boolean', 'null'] },
    confidence: { type: 'number' },
  },
};

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'document_type', 'document_date', 'presenting_complaints', 'diagnoses', 'vitals',
    'medications', 'investigations', 'procedures_surgeries', 'raw_text_excerpt',
    'overall_confidence', 'needs_review', 'review_reason',
  ],
  properties: {
    document_type: {
      anyOf: [
        { type: 'string', enum: ['prescription', 'lab_report', 'discharge_summary', 'other'] },
        { type: 'null' },
      ],
    },
    document_date: nullableString,
    presenting_complaints: stringArray,
    diagnoses: stringArray,
    vitals: VITALS_SCHEMA,
    medications: { type: 'array', items: MEDICATION_SCHEMA },
    investigations: { type: 'array', items: INVESTIGATION_SCHEMA },
    procedures_surgeries: stringArray,
    raw_text_excerpt: nullableString,
    overall_confidence: { type: 'number' },
    needs_review: { type: 'boolean' },
    review_reason: nullableString,
  },
};

module.exports = { EXTRACTION_SCHEMA };
