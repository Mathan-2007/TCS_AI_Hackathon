const LogUpload = require('../models/LogUpload');
const { loadEvents } = require('./ingest');
const { analyzeStudent } = require('./analyzer');

/** Analyze one complaint against an uploaded log. The window is centred on the time the student reported. */
async function runComplaintAnalysis(complaint, uploadId, windowMinutes = 5) {
  const upload = await LogUpload.findById(uploadId).select('examName originalName');
  if (!upload) throw Object.assign(new Error('Log file not found'), { status: 404 });
  const events = await loadEvents(uploadId);

  const opts = {};
  if (complaint.occurredAt) {
    const t = new Date(complaint.occurredAt).getTime();
    opts.from = new Date(t - windowMinutes * 60000);
    opts.to = new Date(t + windowMinutes * 60000);
  }
  const result = analyzeStudent(events, complaint.studentId, opts);
  complaint.result = { ...result, uploadName: upload.examName, analyzedAt: new Date(), windowMinutes: complaint.occurredAt ? windowMinutes : null };
  complaint.upload = upload._id;
  complaint.status = complaint.status === 'resolved' ? 'resolved' : 'analyzed';
  complaint.markModified('result');
  await complaint.save();
  return complaint;
}

/** Students only see a short verdict, never raw log lines (they can contain other students' IDs). */
function studentView(result) {
  if (!result) return null;
  return {
    verdict: result.verdict,
    causeLabel: result.causeLabel,
    explanation: result.explanation,
    analyzedAt: result.analyzedAt,
  };
}

module.exports = { runComplaintAnalysis, studentView };
