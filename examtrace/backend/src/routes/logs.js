const router = require('express').Router();
const multer = require('multer');
const LogUpload = require('../models/LogUpload');
const LogEvent = require('../models/LogEvent');
const { auth, requireRole } = require('../middleware/auth');
const { ingestLog, loadEvents } = require('../services/ingest');
const { analyzeStudent } = require('../services/analyzer');
const wrap = require('../utils/asyncHandler');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
router.use(auth, requireRole('admin'));

router.post('/', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a log file to upload' });
  const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
  if (!['log', 'txt', 'json', 'csv'].includes(ext)) return res.status(400).json({ message: 'Upload a .log, .txt, .json or .csv file' });
  const doc = await ingestLog({
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    examName: (req.body.examName || '').trim(),
    userId: req.user.id,
  });
  res.status(201).json({ _id: doc._id, examName: doc.examName, eventCount: doc.eventCount, incidentCount: doc.incidentCount });
}));

router.get('/', wrap(async (_req, res) => {
  res.json(await LogUpload.find().select('-summary -parseErrors').sort({ createdAt: -1 }).lean());
}));

router.get('/:id', wrap(async (req, res) => {
  const doc = await LogUpload.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ message: 'Log file not found' });
  res.json(doc);
}));

// Analyze one student in this log. Optional ?from=&to= (ISO dates) narrows the time window.
router.get('/:id/student/:studentId', wrap(async (req, res) => {
  const events = await loadEvents(req.params.id);
  res.json(analyzeStudent(events, req.params.studentId.trim(), { from: req.query.from, to: req.query.to }));
}));

// Search raw events: ?student=&level=&source=&q=&from=&to=&limit=
router.get('/:id/events', wrap(async (req, res) => {
  const { student, level, source, q, from, to } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
  const filter = { upload: req.params.id };
  if (student) filter.student = student.trim();
  if (level) filter.level = level.toUpperCase();
  if (source) filter.source = source.toLowerCase();
  if (from || to) filter.ts = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  if (q) filter.raw = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const [items, total] = await Promise.all([
    LogEvent.find(filter).sort({ ts: 1 }).limit(limit).select('ts level source student event latencyMs status raw').lean(),
    LogEvent.countDocuments(filter),
  ]);
  res.json({ total, items });
}));

router.delete('/:id', wrap(async (req, res) => {
  await LogEvent.deleteMany({ upload: req.params.id });
  await LogUpload.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
