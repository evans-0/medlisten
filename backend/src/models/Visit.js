const mongoose = require('mongoose');

const hpiSchema = new mongoose.Schema(
  {
    site: String,
    onset: String,
    character: String,
    radiation: String,
    associatedSymptoms: [String],
    timing: String,
    exacerbatingRelieving: String,
    severity: String,
  },
  { _id: false }
);

const ayushAssessmentSchema = new mongoose.Schema(
  {
    prakriti: String,
    vikriti: String,
    sara: String,
    samhanana: String,
    pramana: String,
    satmya: String,
    sattva: String,
    aharaShakti: String,
    vyayamaShakti: String,
    vaya: String,
    aharaVihara: String,
    nidana: String,
    samprapti: String,
  },
  { _id: false }
);

const transcriptEntrySchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['patient', 'assistant'], required: true },
    // Localized text, shown to the patient.
    text: { type: String, required: true },
    // English canonical text — what the chat LLM actually saw/produced,
    // used to rebuild the model's conversation context on later turns
    // without re-translating the whole history every time. Not required:
    // older visits predate this field and fall back to `text` wherever
    // it's read (see backend/src/routes/visits.js).
    textEn: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const visitSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    ayushMode: { type: Boolean, default: false },
    language: {
      type: String,
      enum: ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'],
      default: 'en',
    },
    transcript: [transcriptEntrySchema],

    // Episodic clinical history for THIS visit only — distinct from the
    // patient's cumulative MedicalHistory record. Re-derived in full by the
    // LLM on every turn (not patched), so it self-corrects rather than
    // accumulating merge errors.
    chiefComplaint: String,
    hpi: hpiSchema,
    pastMedicalSurgicalHistory: [String],
    currentMedications: [String],
    drugAllergyHistory: [String],
    familyHistory: [String],
    personalHistory: String,
    reviewOfSystems: [String],
    ayush: ayushAssessmentSchema,

    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
    },
    redFlag: { type: Boolean, default: false },
    redFlagReason: String,
    triageLevel: {
      type: String,
      enum: ['routine', 'soon', 'urgent', 'emergency', null],
      default: null,
    },
    patientTurnCount: { type: Number, default: 0 },

    // A doctor's signal that the AI-collected history for this visit looks
    // wrong — the intended downstream use is turning flagged conversations
    // into new cases for scripts/evalChat.js, not just a complaint box.
    doctorFeedback: {
      flagged: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      flaggedAt: { type: Date, default: null },
    },

    // The patient's own read on whether the chat actually captured things
    // right, asked once the visit completes. Separate from doctorFeedback —
    // a patient can only judge "did this feel right," not clinical accuracy.
    patientFeedback: {
      helpful: { type: Boolean, default: null },
      submittedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Visit', visitSchema);
