const mongoose = require('mongoose');

const logEventSchema = new mongoose.Schema(
  {
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'LogUpload', required: true },
    ts: { type: Date, required: true },
    level: String,
    source: String, // web, app, db, auth, system, lb, client, thirdparty
    student: String,
    session: String,
    event: String,
    latencyMs: Number,
    status: Number,
    cpu: Number,
    mem: Number,
    dbQueryMs: Number,
    dbPoolUsed: Number,
    dbPoolMax: Number,
    rttMs: Number,
    packetLoss: Number,
    browser: String,
    deviceRamGb: Number,
    network: String,
    error: String,
    msg: String,
    raw: String,
  },
  { versionKey: false }
);

logEventSchema.index({ upload: 1, ts: 1 });
logEventSchema.index({ upload: 1, student: 1, ts: 1 });

module.exports = mongoose.model('LogEvent', logEventSchema);
