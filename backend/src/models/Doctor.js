const mongoose = require('mongoose');

const doctorSchema = new mongoose.Schema(
  {
    doctorId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    specialization: { type: String, trim: true },
    registrationNumber: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Doctor', doctorSchema);
