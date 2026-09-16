const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const patientAuthRoutes = require('./routes/patientAuth');
const doctorAuthRoutes = require('./routes/doctorAuth');
const patientRoutes = require('./routes/patient');
const doctorRoutes = require('./routes/doctor');
const visitRoutes = require('./routes/visits');
const voiceRoutes = require('./routes/voice');

function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  app.use('/api/auth/patient', patientAuthRoutes);
  app.use('/api/auth/doctor', doctorAuthRoutes);
  // More specific path mounted first so it isn't shadowed by patientRoutes'
  // blanket prefix match on '/api/patient'.
  app.use('/api/patient/visits', visitRoutes);
  app.use('/api/patient/voice', voiceRoutes);
  app.use('/api/patient', patientRoutes);
  app.use('/api/doctor', doctorRoutes);

  app.use((req, res) => res.status(404).json({ message: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    if (err.message && err.message.includes('Unsupported file type')) {
      return res.status(400).json({ message: err.message });
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large (max 15MB)' });
    }
    res.status(500).json({ message: 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
