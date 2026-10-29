const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'student'], default: 'student' },
    studentId: { type: String, trim: true }, // roll number used in the logs, e.g. S105
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
