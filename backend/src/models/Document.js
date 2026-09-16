const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    dosage: String,
    frequency: String,
    confidence: { type: Number, min: 0, max: 1, default: 1 },
  },
  { _id: false }
);

const investigationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    value: String,
    unit: String,
    referenceRange: String,
    abnormal: { type: Boolean, default: null },
    confidence: { type: Number, min: 0, max: 1, default: 1 },
  },
  { _id: false }
);

const vitalsSchema = new mongoose.Schema(
  {
    bloodPressure: String,
    pulseRate: String,
    temperature: String,
    respiratoryRate: String,
    spo2: String,
  },
  { _id: false }
);

const extractedDocumentSchema = new mongoose.Schema(
  {
    documentType: { type: String, enum: ['prescription', 'lab_report', 'discharge_summary', 'other', null], default: null },
    documentDate: String,
    presentingComplaints: [String],
    diagnoses: [String],
    vitals: vitalsSchema,
    medications: [medicationSchema],
    investigations: [investigationSchema],
    proceduresSurgeries: [String],
    rawTextExcerpt: String,
    overallConfidence: { type: Number, min: 0, max: 1, default: 1 },
    needsReview: { type: Boolean, default: false },
    reviewReason: String,
  },
  { _id: false }
);

const documentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    originalName: { type: String, required: true },
    storedFileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    fileSize: { type: Number, required: true },
    category: {
      type: String,
      enum: ['prescription', 'lab_report', 'discharge_summary', 'imaging', 'other'],
      default: 'other',
    },
    ocrStatus: {
      type: String,
      enum: ['pending', 'completed', 'unsupported', 'failed'],
      default: 'pending',
    },
    ocrNote: { type: String, default: '' },
    extracted: extractedDocumentSchema,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', documentSchema);
