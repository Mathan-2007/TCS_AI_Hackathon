const LogUpload = require('../models/LogUpload');
const LogEvent = require('../models/LogEvent');
const { parseLogBuffer } = require('./parser');
const { analyzeUpload } = require('./analyzer');

/** Parse a log file buffer, store its events in MongoDB and run the upload-level analysis. */
async function ingestLog({ buffer, originalName, examName, userId }) {
  let parsed;
  try {
    parsed = parseLogBuffer(buffer, originalName);
  } catch (e) {
    throw Object.assign(new Error(`Could not read this file: ${e.message}`), { status: 400 });
  }
  const { events, errors, skipped } = parsed;
  if (!events.length) {
    throw Object.assign(
      new Error('No log events found. Each line needs a timestamp, for example: 2026-10-20T09:31:12Z INFO source=web student=S101 latency_ms=312 status=200'),
      { status: 400 }
    );
  }

  const upload = await LogUpload.create({
    examName: examName || originalName,
    originalName,
    uploadedBy: userId,
    eventCount: events.length,
    skippedLines: skipped,
    parseErrors: errors,
  });

  const BATCH = 5000;
  for (let i = 0; i < events.length; i += BATCH) {
    const docs = events.slice(i, i + BATCH).map((e) => ({ ...e, upload: upload._id }));
    await LogEvent.insertMany(docs, { ordered: false });
  }

  const summary = analyzeUpload(events);
  upload.summary = summary;
  upload.studentCount = summary.stats.students;
  upload.incidentCount = summary.incidents.length;
  upload.timeRange = { start: summary.stats.start, end: summary.stats.end };
  upload.markModified('summary');
  await upload.save();
  return upload;
}

const loadEvents = (uploadId) => LogEvent.find({ upload: uploadId }).sort({ ts: 1 }).lean();

module.exports = { ingestLog, loadEvents };
