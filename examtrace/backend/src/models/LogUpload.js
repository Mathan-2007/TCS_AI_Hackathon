const mongoose = require('mongoose');

const logUploadSchema = new mongoose.Schema(
  {
    examName: { type: String, default: 'Untitled exam' },
    originalName: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    eventCount: Number,
    studentCount: Number,
    incidentCount: { type: Number, default: 0 },
    skippedLines: { type: Number, default: 0 },
    parseErrors: [String],
    timeRange: { start: Date, end: Date },
    // stats, per-minute windows, detected incidents, cause summary, top affected students
    summary: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LogUpload', logUploadSchema);
