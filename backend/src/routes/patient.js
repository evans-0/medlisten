const express = require('express');
const fs = require('fs');
const path = require('path');
const Patient = require('../models/Patient');
const MedicalHistory = require('../models/MedicalHistory');
const Document = require('../models/Document');
const { requireAuth, requireRole } = require('../middleware/auth');
const { upload, UPLOAD_DIR } = require('../middleware/upload');
const { extractDocument } = require('../utils/ocr');
const { mergeDocumentIntoMedicalHistory } = require('../utils/mergeMedicalHistory');
const { generateOverallSummary } = require('../utils/overallSummary');

const router = express.Router();

router.use(requireAuth, requireRole('patient'));

router.get('/me', async (req, res) => {
  const patient = await Patient.findById(req.user.id).select('-passwordHash');
  if (!patient) return res.status(404).json({ message: 'Patient not found' });
  res.json(patient);
});

// ABHA ID is intentionally not editable here — it's the patient's identity
// key, not a correctable profile field.
router.put('/me', async (req, res) => {
  const { name, dob, gender, phone, email } = req.body;

  if (!name || !dob || !gender) {
    return res.status(400).json({ message: 'name, dob, and gender are required' });
  }
  if (!['male', 'female', 'other'].includes(gender)) {
    return res.status(400).json({ message: 'Invalid gender' });
  }

  const patient = await Patient.findByIdAndUpdate(
    req.user.id,
    { name, dob, gender, phone, email },
    { new: true, runValidators: true }
  ).select('-passwordHash');

  if (!patient) return res.status(404).json({ message: 'Patient not found' });
  res.json(patient);
});

const FONT_SIZES = ['normal', 'large', 'xlarge'];
const SETTINGS_LANGUAGES = ['en', 'hi', 'bn', 'te', 'mr', 'ta', 'gu', 'kn', 'ml', 'pa', 'ur', 'or'];

// Separate from PUT /me on purpose — settings (accessibility, default
// language) are a different concern from identity/contact fields, and a
// UI that only wants to flip a toggle shouldn't need to resend name/dob/etc.
router.put('/settings', async (req, res) => {
  const { fontSize, highContrast, largerTouchTargets, preferredLanguage } = req.body;

  if (fontSize !== undefined && !FONT_SIZES.includes(fontSize)) {
    return res.status(400).json({ message: `fontSize must be one of ${FONT_SIZES.join(', ')}` });
  }
  if (preferredLanguage !== undefined && !SETTINGS_LANGUAGES.includes(preferredLanguage)) {
    return res.status(400).json({ message: `preferredLanguage must be one of ${SETTINGS_LANGUAGES.join(', ')}` });
  }

  const update = {};
  if (fontSize !== undefined) update['settings.fontSize'] = fontSize;
  if (highContrast !== undefined) update['settings.highContrast'] = !!highContrast;
  if (largerTouchTargets !== undefined) update['settings.largerTouchTargets'] = !!largerTouchTargets;
  if (preferredLanguage !== undefined) update['settings.preferredLanguage'] = preferredLanguage;

  const patient = await Patient.findByIdAndUpdate(req.user.id, { $set: update }, { new: true, runValidators: true }).select(
    '-passwordHash'
  );
  if (!patient) return res.status(404).json({ message: 'Patient not found' });
  res.json(patient);
});

router.get('/history', async (req, res) => {
  const history = await MedicalHistory.findOne({ patient: req.user.id });
  res.json(history || {});
});

router.put('/history', async (req, res) => {
  const {
    chiefComplaint,
    historyOfPresentIllness,
    pastMedicalHistory,
    pastSurgicalHistory,
    drugAllergyHistory,
    currentMedications,
    familyHistory,
    personalHistory,
    reviewOfSystems,
  } = req.body;

  const history = await MedicalHistory.findOneAndUpdate(
    { patient: req.user.id },
    {
      patient: req.user.id,
      chiefComplaint,
      historyOfPresentIllness,
      pastMedicalHistory,
      pastSurgicalHistory,
      drugAllergyHistory,
      currentMedications,
      familyHistory,
      personalHistory,
      reviewOfSystems,
    },
    { upsert: true, new: true, runValidators: true }
  );

  res.json(history);
});

router.post('/documents', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const { category } = req.body;
  const doc = await Document.create({
    patient: req.user.id,
    originalName: req.file.originalname,
    storedFileName: req.file.filename,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    category: category || 'other',
    ocrStatus: 'pending',
  });

  res.status(201).json(doc);

  // Run extraction asynchronously so the upload response isn't blocked on it.
  const filePath = path.join(UPLOAD_DIR, req.file.filename);
  extractDocument(filePath, req.file.mimetype, doc.category)
    .then(async ({ status, extracted, note }) => {
      const updated = await Document.findByIdAndUpdate(
        doc._id,
        { ocrStatus: status, extracted: extracted || undefined, ocrNote: note || '' },
        { new: true }
      );
      if (status === 'completed' && extracted) {
        await mergeDocumentIntoMedicalHistory(req.user.id, updated);
        // Not awaited — another full LLM call, already inside a
        // fire-and-forget extraction pipeline with nothing left waiting on it.
        generateOverallSummary(req.user.id).catch((err) =>
          console.error('[patient] overall summary refresh failed:', err.message)
        );
      }
    })
    .catch((err) => console.error('Document extraction pipeline error:', err.message));
});

router.get('/documents', async (req, res) => {
  const docs = await Document.find({ patient: req.user.id }).sort({ createdAt: -1 });
  res.json(docs);
});

router.get('/documents/:id', async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, patient: req.user.id });
  if (!doc) return res.status(404).json({ message: 'Document not found' });
  res.json(doc);
});

router.get('/documents/:id/file', async (req, res) => {
  const doc = await Document.findOne({ _id: req.params.id, patient: req.user.id });
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  const filePath = path.join(UPLOAD_DIR, doc.storedFileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found on server' });
  }
  res.setHeader('Content-Type', doc.mimeType);
  res.sendFile(filePath);
});

router.delete('/documents/:id', async (req, res) => {
  const doc = await Document.findOneAndDelete({ _id: req.params.id, patient: req.user.id });
  if (!doc) return res.status(404).json({ message: 'Document not found' });

  const filePath = path.join(UPLOAD_DIR, doc.storedFileName);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') console.error('Failed to delete file:', err.message);
  });

  res.json({ message: 'Document deleted' });
});

module.exports = router;
