const router = require('express').Router();
const fs = require('fs/promises');
const { existsSync } = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const multer = require('multer');
const LogUpload = require('../models/LogUpload');
const LogEvent = require('../models/LogEvent');
const { auth, requireRole } = require('../middleware/auth');
const { ingestLog, loadEvents } = require('../services/ingest');
const { analyzeStudent } = require('../services/analyzer');
const wrap = require('../utils/asyncHandler');
const { clearDemoData } = require('../utils/seed');

const execFileAsync = promisify(execFile);

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

async function exportLogUploadToAiCsv(uploadId) {
  const events = await loadEvents(uploadId);
  const buckets = new Map();

  for (const event of events) {
    if (!event.ts) continue;
    const ts = new Date(event.ts);
    const minuteKey = new Date(ts.getFullYear(), ts.getMonth(), ts.getDate(), ts.getHours(), ts.getMinutes()).toISOString();
    let bucket = buckets.get(minuteKey);
    if (!bucket) {
      bucket = {
        timestamp: new Date(minuteKey),
        students: new Set(),
        latencies: [],
        cpu: [],
        mem: [],
        db: [],
        errors: 0,
      };
      buckets.set(minuteKey, bucket);
    }
    if (event.student) bucket.students.add(String(event.student));
    if (Number.isFinite(event.latencyMs)) bucket.latencies.push(event.latencyMs);
    if (Number.isFinite(event.cpu)) bucket.cpu.push(event.cpu);
    if (Number.isFinite(event.mem)) bucket.mem.push(event.mem);
    if (Number.isFinite(event.dbQueryMs)) bucket.db.push(event.dbQueryMs);
    if (event.status >= 400 || event.error) bucket.errors += 1;
  }

  const rows = [
    ['timestamp', 'active_users', 'response_time_ms', 'cpu_usage_pct', 'memory_usage_pct', 'db_query_time_ms', 'bandwidth_mbps', 'error_count', 'complaint_text'],
  ];

  for (const minute of [...buckets.keys()].sort()) {
    const bucket = buckets.get(minute);
    const responseTime = median(bucket.latencies) || 0;
    const cpu = median(bucket.cpu) || 0;
    const mem = median(bucket.mem) || 0;
    const db = median(bucket.db) || 0;
    const bandwidth = Math.max(0, Math.min(1000, Math.round((bucket.students.size * 0.4) + (responseTime / 25))));
    const timestamp = new Date(minute).toISOString().replace('Z', '');
    rows.push([
      timestamp,
      String(bucket.students.size || 0),
      String(Math.round(responseTime)),
      String(Math.round(cpu)),
      String(Math.round(mem)),
      String(Math.round(db)),
      String(bandwidth),
      String(bucket.errors || 0),
      '',
    ]);
  }

  const csvText = rows.map((r) => r.join(',')).join('\n');
  const csvPath = path.join(os.tmpdir(), `examtrace-ai-${uploadId}-${Date.now()}.csv`);
  await fs.writeFile(csvPath, csvText, 'utf-8');
  return csvPath;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
router.use(auth, requireRole('admin'));

router.post('/', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a log file to upload' });
  const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
  if (!['log', 'txt', 'json', 'jsonl', 'csv'].includes(ext)) return res.status(400).json({ message: 'Upload a .log, .txt, .json, .jsonl or .csv file' });
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

router.post('/:id/ai', wrap(async (req, res) => {
  const logUpload = await LogUpload.findById(req.params.id).lean();
  if (!logUpload) return res.status(404).json({ message: 'Log file not found' });

  const csvPath = await exportLogUploadToAiCsv(req.params.id);
  const aiRoot = path.resolve(__dirname, '../../../../exam_incident_ai');
  const outDir = path.join(aiRoot, 'reports', `examtrace_${req.params.id}`);
  const pythonBin = process.env.PYTHON_BIN ||
    (existsSync(path.join(aiRoot, '.venv', 'bin', 'python')) ? path.join(aiRoot, '.venv', 'bin', 'python') : '/usr/bin/python');
  const args = [path.join(aiRoot, 'analyze.py'), csvPath, '--out', outDir];

  if (req.body && req.body.capacity) args.push('--capacity', String(req.body.capacity));
  if (req.body && req.body.anchor) args.push('--anchor', String(req.body.anchor));

  let proc;
  try {
    proc = await execFileAsync(pythonBin, args, { cwd: aiRoot, maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    const details = error.stderr || error.stdout || error.message || 'AI model failed';
    return res.status(500).json({ message: details });
  }

  const reportName = `${path.basename(csvPath, '.csv')}_report.md`;
  const imageName = `${path.basename(csvPath, '.csv')}_timeline.png`;
  const reportPath = path.join(outDir, reportName);
  const imagePath = path.join(outDir, imageName);

  let output = proc.stdout || 'No report was generated.';
  let imageData = null;

  try {
    output = await fs.readFile(reportPath, 'utf-8');
  } catch (_error) {
    output = proc.stdout || 'No report was generated.';
  }

  try {
    const image = await fs.readFile(imagePath);
    imageData = `data:image/png;base64,${image.toString('base64')}`;
  } catch (_error) {
    imageData = null;
  }

  res.json({ ok: true, output, imageData, status: 'ok', stderr: proc.stderr || '', stdout: proc.stdout || '' });
}));

router.delete('/demo', wrap(async (_req, res) => {
  const summary = await clearDemoData({ keepAdmin: true });
  res.json({ ok: true, summary });
}));

router.delete('/:id', wrap(async (req, res) => {
  await LogEvent.deleteMany({ upload: req.params.id });
  await LogUpload.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
