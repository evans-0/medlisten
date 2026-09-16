const mongoose = require('mongoose');

// Stored on the account (not localStorage) deliberately: this app's roots
// are a shared-kiosk patient intake tool (see README), where a per-device
// preference would leak between patients using the same terminal.
// Accessibility settings and the default chat language should follow the
// person, not the device.
const settingsSchema = new mongoose.Schema(
  {
    fontSize: { type: String, enum: ['normal', 'large', 'xlarge'], default: 'normal' },
    highContrast: { type: Boolean, default: false },
    largerTouchTargets: { type: Boolean, default: false },
    // Same language codes the chat engine supports (backend/src/utils/chat/prompts.js).
    preferredLanguage: {
      type: String,
      enum: ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'],
      default: 'en',
    },
  },
  { _id: false }
);

const patientSchema = new mongoose.Schema(
  {
    abhaId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: [/^\d{14}$/, 'ABHA ID must be exactly 14 digits'],
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    dob: { type: Date, required: true },
    gender: { type: String, enum: ['male', 'female', 'other'], required: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    settings: { type: settingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Patient', patientSchema);
