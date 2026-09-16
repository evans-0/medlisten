const express = require('express');
const bcrypt = require('bcryptjs');
const Doctor = require('../models/Doctor');
const { signToken } = require('../middleware/auth');

const router = express.Router();

// NOTE: Open self-registration is fine for a hackathon demo. In a real
// deployment, doctor accounts should be provisioned by a hospital admin
// instead of being publicly self-serve.
router.post('/register', async (req, res) => {
  try {
    const { doctorId, password, name, specialization, registrationNumber } = req.body;

    if (!doctorId || !password || !name) {
      return res.status(400).json({ message: 'doctorId, password, and name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const existing = await Doctor.findOne({ doctorId: doctorId.toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'An account with this doctor ID already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const doctor = await Doctor.create({
      doctorId: doctorId.toLowerCase(),
      passwordHash,
      name,
      specialization,
      registrationNumber,
    });

    const token = signToken({ id: doctor._id, role: 'doctor', doctorId: doctor.doctorId });
    res.status(201).json({
      token,
      doctor: { id: doctor._id, doctorId: doctor.doctorId, name: doctor.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to register doctor' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { doctorId, password } = req.body;
    if (!doctorId || !password) {
      return res.status(400).json({ message: 'doctorId and password are required' });
    }

    const doctor = await Doctor.findOne({ doctorId: doctorId.toLowerCase() });
    if (!doctor) {
      return res.status(401).json({ message: 'Invalid doctor ID or password' });
    }

    const valid = await bcrypt.compare(password, doctor.passwordHash);
    if (!valid) {
      return res.status(401).json({ message: 'Invalid doctor ID or password' });
    }

    const token = signToken({ id: doctor._id, role: 'doctor', doctorId: doctor.doctorId });
    res.json({
      token,
      doctor: { id: doctor._id, doctorId: doctor.doctorId, name: doctor.name },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to log in' });
  }
});

module.exports = router;
