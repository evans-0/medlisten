const express = require('express');
const fs = require('fs');
const path = require('path');
const Patient = require('../models/Patient');
const MedicalHistory = require('../models/MedicalHistory');
const Document = require('../models/Document');
const Visit = require('../models/Visit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { UPLOAD_DIR } = require('../middleware/upload');

const router = express.Router();

router.use(requireAuth, requireRole('doctor'));

// A doctor's signal that the AI-collected history for this visit is
// inaccurate.
router.patch('/visits/:id/flag', async (req, res) => {
  const { reason } = req.body;
  const visit = await Visit.findByIdAndUpdate(
    req.params.id,
    { doctorFeedback: { flagged: true, reason: reason || '', flaggedAt: new Date() } },
    { new: true }
  );
  if (!visit) return res.status(404).json({ message: 'Visit not found' });
  res.json(visit);
});

router.get('/patients/:abhaId', async (req, res) => {
  const { abhaId } = req.params;
  if (!/^\d{14}$/.test(abhaId)) {
    return res.status(400).json({ message: 'ABHA ID must be exactly 14 digits' });
  }

  const patient = await Patient.findOne({ abhaId }).select('-passwordHash');
  if (!patient) return res.status(404).json({ message: 'No patient found with this ABHA ID' });

  const [history, documents, visits] = await Promise.all([
    MedicalHistory.findOne({ patient: patient._id }),
    Document.find({ patient: patient._id }).sort({ createdAt: -1 }),
    Visit.find({ patient: patient._id }).sort({ createdAt: -1 }),
  ]);

  res.json({ patient, history: history || {}, documents, visits });
});

router.get('/visits/:id', async (req, res) => {
  const visit = await Visit.findById(req.params.id);
  if (!visit) return res.status(404).json({ message: 'Visit not found' });
  res.json(visit);
});

router.get('/documents/:id/file', async (req, res) => {
  const doc = await Document.findById(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  const filePath = path.join(UPLOAD_DIR, doc.storedFileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found on server' });
  }
  res.setHeader('Content-Type', doc.mimeType);
  res.sendFile(filePath);
});

module.exports = router;
