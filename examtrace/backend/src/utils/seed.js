/** Creates demo accounts, imports the sample log and files demo complaints. Usage: npm run seed */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const LogUpload = require('../models/LogUpload');
const LogEvent = require('../models/LogEvent');
const Complaint = require('../models/Complaint');
const { ingestLog } = require('../services/ingest');
const { runComplaintAnalysis } = require('../services/complaintService');

const samplePath = path.join(__dirname, '..', '..', 'sample-data', 'exam_sample.log');

const DEMO_COMPLAINTS = [
  ['S105', 'Meera R', '2026-10-20T09:50:00Z', 'slow', 'The screen kept lagging and disconnecting around 9:50.'],
  ['S118', 'Arun K', '2026-10-20T09:40:00Z', 'question_not_loading', 'Questions loaded very slowly for me the whole exam.'],
  ['S131', 'Divya S', '2026-10-20T11:08:00Z', 'logged_out', 'I was logged out again and again near the end.'],
  ['S121', 'Karthik P', '2026-10-20T10:18:00Z', 'submit_failed', 'Saving my answer gave an error around 10:18.'],
  ['S140', 'Nisha V', '2026-10-20T10:07:00Z', 'freeze', 'Everything froze at about 10:07 and I could not move to the next question.'],
  ['S150', 'Vikram T', '2026-10-20T10:52:00Z', 'slow', 'The exam was very slow at 10:52.'],
  ['S145', 'Sana M', '2026-10-20T11:16:00Z', 'freeze', 'The page stopped responding at 11:16 and reconnected.'],
  ['S112', 'Rahul D', '2026-10-20T10:32:00Z', 'freeze', 'Exam froze for a few minutes around 10:32.'],
  ['S160', 'Lavanya G', '2026-10-20T09:40:00Z', 'slow', 'I felt it was slow for me.'],
];

async function clearDemoData({ keepAdmin = true } = {}) {
  const [uploads, events, complaints, students] = await Promise.all([
    LogUpload.deleteMany({}),
    LogEvent.deleteMany({}),
    Complaint.deleteMany({}),
    User.deleteMany({ role: 'student' }),
  ]);

  if (keepAdmin) {
    const admin = await User.findOne({ email: 'admin@exam.local' });
    if (!admin) {
      await User.create({
        email: 'admin@exam.local',
        name: 'Exam Cell Admin',
        role: 'admin',
        passwordHash: await bcrypt.hash('Admin@123', 10),
      });
    }
  }

  return {
    uploads: uploads.deletedCount ?? 0,
    events: events.deletedCount ?? 0,
    complaints: complaints.deletedCount ?? 0,
    students: students.deletedCount ?? 0,
  };
}

async function seedDemoData() {
  await connectDB();

  const upsertUser = async (email, data) =>
    (await User.findOne({ email })) || User.create({ email, ...data });

  await upsertUser('admin@exam.local', { name: 'Exam Cell Admin', role: 'admin', passwordHash: await bcrypt.hash('Admin@123', 10) });
  const studentHash = await bcrypt.hash('Student@123', 10);
  const users = {};
  for (const [sid, name] of DEMO_COMPLAINTS) users[sid] = await upsertUser(`${sid.toLowerCase()}@student.local`, { name, role: 'student', studentId: sid, passwordHash: studentHash });

  if (!fs.existsSync(samplePath)) require('./generateSample');
  let upload = await LogUpload.findOne({ originalName: 'exam_sample.log' });
  if (!upload) {
    upload = await ingestLog({ buffer: fs.readFileSync(samplePath), originalName: 'exam_sample.log', examName: 'Data Structures - Internal Test 2 (sample)' });
    console.log(`Imported sample log: ${upload.eventCount} events, ${upload.incidentCount} incidents`);
  }

  if (!(await Complaint.countDocuments())) {
    for (const [sid, name, at, category, text] of DEMO_COMPLAINTS) {
      const c = await Complaint.create({ student: users[sid]._id, studentId: sid, studentName: name, examName: upload.examName, category, text, occurredAt: at });
      if (sid !== 'S160') await runComplaintAnalysis(c, upload._id, 5);
    }
    console.log(`Created ${DEMO_COMPLAINTS.length} demo complaints (S160 left unanalyzed to try it yourself)`);
  }

  console.log('\nAdmin login:   admin@exam.local / Admin@123');
  console.log('Student login: s105@student.local / Student@123');
  return { uploadId: upload._id, complaintCount: DEMO_COMPLAINTS.length };
}

if (require.main === module) {
  (async () => {
    try {
      await seedDemoData();
      await mongoose.disconnect();
    } catch (e) {
      console.error(e);
      process.exit(1);
    }
  })();
}

module.exports = { seedDemoData, clearDemoData };
