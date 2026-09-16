const mongoose = require('mongoose');

const medicalHistorySchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      unique: true,
    },
    chiefComplaint: { type: String, trim: true, default: '' },
    historyOfPresentIllness: { type: String, trim: true, default: '' },
    pastMedicalHistory: { type: String, trim: true, default: '' },
    pastSurgicalHistory: { type: String, trim: true, default: '' },
    drugAllergyHistory: { type: String, trim: true, default: '' },
    currentMedications: [{ type: String, trim: true }],
    familyHistory: { type: String, trim: true, default: '' },
    personalHistory: { type: String, trim: true, default: '' },
    reviewOfSystems: { type: String, trim: true, default: '' },

    // A synthesized, doctor-facing narrative across ALL of this patient's
    // visits and documents — distinct from the fields above, which are raw
    // accumulated facts. Regenerated from scratch (not patched) every time
    // a visit completes or a document finishes extraction — see
    // utils/overallSummary.js — so it never drifts from what's actually on
    // file, the same "re-derive the full state" reasoning already used for
    // a single visit's own history in utils/chat/prompts.js.
    overallSummary: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MedicalHistory', medicalHistorySchema);
