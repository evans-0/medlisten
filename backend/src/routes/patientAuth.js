const express = require('express');
const bcrypt = require('bcryptjs');
const Patient = require('../models/Patient');
const { signToken } = require('../middleware/auth');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { abhaId, password, name, dob, gender, phone, email } = req.body;

    if (!abhaId || !password || !name || !dob || !gender) {
      return res.status(400).json({ message: 'abhaId, password, name, dob, and gender are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    if (!/^\d{14}$/.test(abhaId)) {
      return res.status(400).json({ message: 'ABHA ID must be exactly 14 digits' });
    }

    const existing = await Patient.findOne({ abhaId });
    if (existing) {
      return res.status(409).json({ message: 'An account with this ABHA ID already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const patient = await Patient.create({
      abhaId,
      passwordHash,
      name,
      dob,
      gender,
      phone,
      email,
    });

    const token = signToken({ id: patient._id, role: 'patient', abhaId: patient.abhaId });
    res.status(201).json({
      token,
      patient: { id: patient._id, abhaId: patient.abhaId, name: patient.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to register patient' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { abhaId, password } = req.body;
    if (!abhaId || !password) {
      return res.status(400).json({ message: 'abhaId and password are required' });
    }

    const patient = await Patient.findOne({ abhaId });
    if (!patient) {
      return res.status(401).json({ message: 'Invalid ABHA ID or password' });
    }

    const valid = await bcrypt.compare(password, patient.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid ABHA ID or password' });
    }

    const token = signToken({ id: patient._id, role: 'patient', abhaId: patient.abhaId });
    res.json({
      token,
      patient: { id: patient._id, abhaId: patient.abhaId, name: patient.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to log in' });
  }
});

// No email/SMS infra exists in this app, and patients use it from a shared
// kiosk they're physically present at — not a random public signup — so
// identity is verified with ABHA ID + date of birth (both already collected
// at registration) rather than a mailed reset link. Deliberately returns the
// same generic message whether the ABHA ID doesn't exist or the DOB doesn't
// match, same as /login, so this can't be used to probe which ABHA IDs are
// registered.
router.post('/reset-password', async (req, res) => {
  try {
    const { abhaId, dob, newPassword } = req.body;
    if (!abhaId || !dob || !newPassword) {
      return res.status(400).json({ message: 'abhaId, dob, and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const patient = await Patient.findOne({ abhaId });
    const dobMatches = patient && new Date(patient.dob).toISOString().slice(0, 10) === dob;
    if (!dobMatches) {
      return res.status(401).json({ message: 'ABHA ID and date of birth do not match our records' });
    }

    patient.passwordHash = await bcrypt.hash(newPassword, 10);
    await patient.save();

    const token = signToken({ id: patient._id, role: 'patient', abhaId: patient.abhaId });
    res.json({
      token,
      patient: { id: patient._id, abhaId: patient.abhaId, name: patient.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

module.exports = router;
