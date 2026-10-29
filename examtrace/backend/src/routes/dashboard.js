const router = require('express').Router();
const LogUpload = require('../models/LogUpload');
const Complaint = require('../models/Complaint');
const { auth, requireRole } = require('../middleware/auth');
const { CAUSES } = require('../services/analyzer');
const wrap = require('../utils/asyncHandler');

router.use(auth, requireRole('admin'));

router.get('/', wrap(async (_req, res) => {
  const [uploads, complaints] = await Promise.all([
    LogUpload.find().select('examName originalName eventCount studentCount incidentCount timeRange createdAt summary.causeSummary').sort({ createdAt: -1 }).lean(),
    Complaint.find().select('studentId studentName text status occurredAt createdAt result.cause result.causeLabel result.verdict result.confidence').sort({ createdAt: -1 }).lean(),
  ]);

  const incidentCauses = {};
  uploads.forEach((u) => Object.entries(u.summary?.causeSummary || {}).forEach(([k, n]) => (incidentCauses[k] = (incidentCauses[k] || 0) + n)));
  const complaintCauses = {};
  complaints.filter((c) => c.result?.cause).forEach((c) => (complaintCauses[c.result.cause] = (complaintCauses[c.result.cause] || 0) + 1));
  const toList = (o) => Object.entries(o).map(([cause, count]) => ({ cause, label: CAUSES[cause]?.label || cause, count })).sort((a, b) => b.count - a.count);

  res.json({
    counts: {
      uploads: uploads.length,
      events: uploads.reduce((s, u) => s + (u.eventCount || 0), 0),
      incidents: uploads.reduce((s, u) => s + (u.incidentCount || 0), 0),
      complaints: complaints.length,
      openComplaints: complaints.filter((c) => c.status === 'open').length,
      analyzedComplaints: complaints.filter((c) => c.status === 'analyzed').length,
      resolvedComplaints: complaints.filter((c) => c.status === 'resolved').length,
    },
    incidentCauses: toList(incidentCauses),
    complaintCauses: toList(complaintCauses),
    recentUploads: uploads.slice(0, 5).map(({ summary, ...u }) => u),
    recentComplaints: complaints.slice(0, 6),
  });
}));

module.exports = router;
