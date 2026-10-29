const router = require('express').Router();
const PDFDocument = require('pdfkit');
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const { auth, requireRole } = require('../middleware/auth');
const { runComplaintAnalysis, studentView } = require('../services/complaintService');
const wrap = require('../utils/asyncHandler');

router.use(auth);

const present = (c, role) => {
  const o = c.toObject ? c.toObject() : c;
  if (role !== 'admin') o.result = studentView(o.result);
  return o;
};

async function loadOwned(req, res) {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Complaint not found' }) && null;
  if (req.user.role !== 'admin' && String(c.student) !== String(req.user.id)) {
    res.status(403).json({ message: 'You can only view your own complaints' });
    return null;
  }
  return c;
}

router.post('/', wrap(async (req, res) => {
  const { text, examName, occurredAt, category } = req.body;
  if (!text || text.trim().length < 5) return res.status(400).json({ message: 'Describe what happened in a few words' });
  let studentId = req.user.studentId;
  let student = req.user.id;
  let studentName = req.user.name;
  if (req.user.role === 'admin') {
    if (!req.body.studentId) return res.status(400).json({ message: 'Enter the student ID this complaint is for' });
    studentId = req.body.studentId.trim();
    const u = await User.findOne({ studentId, role: 'student' });
    student = u?._id;
    studentName = u?.name || req.body.studentName || '';
  }
  const doc = await Complaint.create({ student, studentId, studentName, examName, category, text: text.trim(), occurredAt: occurredAt || undefined });
  res.status(201).json(present(doc, req.user.role));
}));

router.get('/', wrap(async (req, res) => {
  const filter = req.user.role === 'admin' ? {} : { student: req.user.id };
  if (req.query.status) filter.status = req.query.status;
  const list = await Complaint.find(filter).sort({ createdAt: -1 }).lean();
  res.json(list.map((c) => present(c, req.user.role)));
}));

router.get('/:id', wrap(async (req, res) => {
  const c = await loadOwned(req, res);
  if (c) res.json(present(c, req.user.role));
}));

router.post('/:id/analyze', requireRole('admin'), wrap(async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Complaint not found' });
  if (!req.body.uploadId) return res.status(400).json({ message: 'Choose the log file to analyze against' });
  const minutes = Math.min(Math.max(parseInt(req.body.windowMinutes, 10) || 5, 1), 60);
  await runComplaintAnalysis(c, req.body.uploadId, minutes);
  res.json(present(c, 'admin'));
}));

router.patch('/:id', requireRole('admin'), wrap(async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Complaint not found' });
  if (['open', 'analyzed', 'resolved'].includes(req.body.status)) c.status = req.body.status;
  if (typeof req.body.adminNote === 'string') c.adminNote = req.body.adminNote;
  await c.save();
  res.json(present(c, 'admin'));
}));

router.get('/:id/report', requireRole('admin'), wrap(async (req, res) => {
  const c = await Complaint.findById(req.params.id).lean();
  if (!c) return res.status(404).json({ message: 'Complaint not found' });
  const r = c.result;
  if (!r) return res.status(400).json({ message: 'Analyze this complaint before downloading a report' });

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="complaint-${c.studentId}-${c._id}.pdf"`);
  doc.pipe(res);

  doc.font('Helvetica-Bold').fontSize(20).text('Root Cause Analysis Report');
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#555').text(`Generated ${new Date().toUTCString()}`);
  doc.fillColor('#000').moveDown();

  const row = (k, v) => doc.font('Helvetica-Bold').fontSize(10).text(`${k}: `, { continued: true }).font('Helvetica').text(String(v ?? '-'));
  row('Student', `${c.studentName || ''} (${c.studentId})`);
  row('Exam', c.examName || r.uploadName);
  row('Reported time', c.occurredAt ? new Date(c.occurredAt).toUTCString() : 'Not given');
  row('Log file', r.uploadName);
  doc.moveDown(0.5).font('Helvetica-Bold').text('Student complaint').font('Helvetica').text(c.text);

  doc.moveDown().font('Helvetica-Bold').fontSize(14).text(`Finding: ${r.causeLabel}`);
  doc.font('Helvetica').fontSize(10).text(`Confidence: ${Math.round((r.confidence || 0) * 100)}%   Verdict: ${r.verdict}`);
  doc.moveDown(0.5).fontSize(11).text(r.explanation);

  if (r.stats?.requests) {
    doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Key numbers').font('Helvetica').fontSize(10);
    doc.text(`Requests: ${r.stats.requests}   Slow or failed: ${r.stats.problemRequests}   Average latency: ${r.stats.avgLatency} ms   Platform median: ${r.serverMedianLatency} ms`);
  }
  if (r.factors?.length) {
    doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Why the system concluded this');
    doc.font('Helvetica').fontSize(10);
    r.factors.forEach((f) => doc.text(`• ${f.label} (contribution ${f.weight})`));
  }
  if (r.evidence?.length) {
    doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Evidence from the logs');
    doc.font('Courier').fontSize(7.5);
    r.evidence.forEach((l) => doc.text(l, { width: 495 }).moveDown(0.2));
  }
  if (r.recommendations?.length) {
    doc.moveDown().font('Helvetica-Bold').fontSize(12).text('Recommended actions');
    doc.font('Helvetica').fontSize(10);
    r.recommendations.forEach((l) => doc.text(`• ${l}`));
  }
  if (c.adminNote) doc.moveDown().font('Helvetica-Bold').text('Admin note').font('Helvetica').text(c.adminNote);
  doc.end();
}));

module.exports = router;
