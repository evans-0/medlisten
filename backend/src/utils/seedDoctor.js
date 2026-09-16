require('dotenv').config();
const bcrypt = require('bcryptjs');
const connectDB = require('../config/db');
const Doctor = require('../models/Doctor');
const mongoose = require('mongoose');

const DEMO_DOCTOR_ID = 'dr.sharma';
const DEMO_PASSWORD = 'doctor123';

async function seed() {
  await connectDB();

  const existing = await Doctor.findOne({ doctorId: DEMO_DOCTOR_ID });
  if (existing) {
    console.log(`Doctor "${DEMO_DOCTOR_ID}" already exists, skipping.`);
  } else {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await Doctor.create({
      doctorId: DEMO_DOCTOR_ID,
      passwordHash,
      name: 'Dr. Sharma',
      specialization: 'General Medicine',
      registrationNumber: 'DEMO-0001',
    });
    console.log(`Created demo doctor account: ${DEMO_DOCTOR_ID} / ${DEMO_PASSWORD}`);
  }

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
