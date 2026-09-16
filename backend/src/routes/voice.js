const express = require('express');
const multer = require('multer');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('patient'));

const VOICE_SERVICE_URL = process.env.VOICE_SERVICE_URL || 'http://localhost:8010';
const VOICE_TIMEOUT_MS = Number(process.env.VOICE_TIMEOUT_MS) || 30000;

// Memory storage, not disk — this audio is never persisted (same "discard
// after transcribing" principle as the source voice-module), it's just
// forwarded to the transcription service and immediately dropped.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.get('/backends', async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${VOICE_SERVICE_URL}/backends`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) throw new Error(`status ${r.status}`);
    res.json(await r.json());
  } catch (err) {
    res.status(503).json({ whisper: { available: false }, mock: { available: false } });
  }
});

router.post('/transcribe', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No audio file uploaded' });
  }

  const { language } = req.body;
  const form = new FormData();
  form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname || 'clip.webm');
  form.append('backend', 'auto');
  if (language) form.append('language', language);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VOICE_TIMEOUT_MS);

  try {
    const r = await fetch(`${VOICE_SERVICE_URL}/transcribe`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ message: data.detail || 'Transcription failed' });
    }
    res.json(data);
  } catch (err) {
    console.error('[voice] transcription request failed:', err.message);
    res.status(503).json({ message: 'Voice transcription is currently unavailable. Please type your answer instead.' });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
