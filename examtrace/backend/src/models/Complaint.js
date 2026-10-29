const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    studentId: { type: String, required: true, trim: true },
    studentName: String,
    examName: { type: String, default: '' },
    category: {
      type: String,
      enum: ['slow', 'freeze', 'submit_failed', 'logged_out', 'question_not_loading', 'other'],
      default: 'slow',
    },
    text: { type: String, required: true },
    occurredAt: Date,
    status: { type: String, enum: ['open', 'analyzed', 'resolved'], default: 'open' },
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'LogUpload' },
    result: { type: mongoose.Schema.Types.Mixed },
    adminNote: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', complaintSchema);
