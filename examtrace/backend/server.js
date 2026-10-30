require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const { seedDemoData } = require('./src/utils/seed');

const aiPython = path.resolve(__dirname, '..', '..', 'exam_incident_ai', '.venv', 'bin', 'python');
if (!process.env.PYTHON_BIN && fs.existsSync(aiPython)) process.env.PYTHON_BIN = aiPython;

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/logs', require('./src/routes/logs'));
app.use('/api/complaints', require('./src/routes/complaints'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/live', require('./src/routes/live'));

app.use((req, res) => res.status(404).json({ message: 'Route not found' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

const PORT = process.env.PORT || 5000;
connectDB()
  .then(async () => {
    if (process.env.AUTO_SEED === 'true') {
      const result = await seedDemoData();
      console.log(`Auto-seed status: ${result ? 'demo data loaded' : 'nothing to seed'}`);
    }
    app.listen(PORT, () => console.log(`ExamTrace API running on http://localhost:${PORT}`));
  })
  .catch((e) => {
    console.error('Could not connect to MongoDB:', e.message);
    process.exit(1);
  });
