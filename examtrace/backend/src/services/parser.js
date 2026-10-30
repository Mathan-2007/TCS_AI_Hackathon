/**
 * Log parser. Accepts .log / .txt (key=value lines or JSON lines), .json (array or JSON lines) and .csv.
 * Every record is normalized to one canonical event shape so the analyzer never cares about the source format.
 */
const { parse: parseCsv } = require('csv-parse/sync');

const ALIASES = {
  ts: ['timestamp', 'ts', 'time', '@timestamp', 'datetime', 'date'],
  level: ['level', 'severity', 'loglevel'],
  source: ['source', 'service', 'component', 'origin'],
  student: ['student', 'student_id', 'studentid', 'student_ref', 'user', 'user_id', 'userid'],
  session: ['session', 'session_id', 'sessionid', 'sid'],
  event: ['event', 'action', 'type', 'operation', 'path', 'method', 'request_id', 'scenario_label'],
  latencyMs: ['latency_ms', 'latency', 'response_time', 'response_time_ms', 'duration_ms', 'duration', 'took_ms', 'took'],
  status: ['status', 'status_code', 'http_status', 'code'],
  cpu: ['cpu', 'cpu_percent', 'cpu_pct', 'cpu_usage_pct'],
  mem: ['mem', 'memory', 'mem_percent', 'memory_percent', 'memory_usage_pct'],
  dbQueryMs: ['db_query_ms', 'query_ms', 'query_time_ms', 'db_query_time_ms'],
  dbPoolUsed: ['db_pool_used', 'pool_used', 'db_pool_utilization_pct'],
  dbPoolMax: ['db_pool_max', 'pool_max', 'disk_io_utilization_pct'],
  rttMs: ['rtt_ms', 'rtt', 'network_latency_ms'],
  packetLoss: ['packet_loss', 'loss', 'packet_loss_pct'],
  browser: ['browser', 'user_agent', 'ua'],
  deviceRamGb: ['device_ram_gb', 'ram_gb', 'ram'],
  network: ['network', 'net', 'connection_type'],
  error: ['error', 'err', 'exception'],
  msg: ['msg', 'message'],
};
const NUMERIC = new Set(['latencyMs', 'status', 'cpu', 'mem', 'dbQueryMs', 'dbPoolUsed', 'dbPoolMax', 'rttMs', 'packetLoss', 'deviceRamGb']);
const LOOKUP = {};
for (const [canon, names] of Object.entries(ALIASES)) names.forEach((n) => (LOOKUP[n] = canon));

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = parseFloat(String(v).replace(/(ms|%|gb)$/i, ''));
  return Number.isFinite(n) ? n : undefined;
};

function toDate(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number' || /^\d{9,13}(\.\d+)?$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n);
  }

  const text = String(v).trim();
  if (!text) return null;

  // Timestamps in the source logs are usually server-generated UTC values.
  // If a source string omits a timezone offset, preserve the intended instant
  // by treating it as UTC rather than interpreting it in the local timezone.
  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const d = new Date(hasExplicitTimezone ? text : `${text}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalize(rec, raw) {
  const out = { raw: raw ? String(raw).slice(0, 600) : undefined };
  for (const [k, v] of Object.entries(rec)) {
    const canon = LOOKUP[String(k).toLowerCase()];
    if (!canon || v === undefined || v === null || v === '') continue;
    if (NUMERIC.has(canon)) {
      const n = num(v);
      if (n !== undefined) out[canon] = n;
    } else if (canon !== 'ts') {
      out[canon] = String(v);
    } else {
      out.ts = v;
    }
  }
  const ts = toDate(out.ts);
  if (!ts) return null;
  out.ts = ts;
  out.level = (out.level || 'INFO').toUpperCase();
  out.source = (out.source || 'app').toLowerCase();
  if (out.student) out.student = out.student.trim();
  return out;
}

const KV = /([A-Za-z_@][\w.@-]*)=("([^"]*)"|\S*)/g;

function parseTextLine(line) {
  const rec = {};
  let rest = line;
  if (!/^\S+=/.test(line)) {
    const m = line.match(/^(\S+)\s+([A-Za-z]+)\s+(.*)$/);
    if (m) {
      rec.timestamp = m[1];
      rec.level = m[2];
      rest = m[3];
    }
  }
  let leftover = rest;
  for (const m of rest.matchAll(KV)) {
    rec[m[1]] = m[3] !== undefined ? m[3] : m[2];
    leftover = leftover.replace(m[0], '');
  }
  leftover = leftover.trim();
  if (leftover && !rec.msg && !rec.message) rec.msg = leftover;
  return rec;
}

function parseLogBuffer(buffer, filename = '') {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const errors = [];
  const events = [];
  let total = 0;
  let skipped = 0;

  const addRecord = (rec, raw, label) => {
    total++;
    const ev = normalize(rec, raw);
    if (ev) events.push(ev);
    else {
      skipped++;
      if (errors.length < 15) errors.push(`${label}: missing or invalid timestamp`);
    }
  };

  const trimmed = text.trim();
  if (ext === 'csv') {
    const rows = parseCsv(text, { columns: true, skip_empty_lines: true, relax_column_count: true, trim: true });
    rows.forEach((r, i) => addRecord(r, Object.values(r).join(','), `row ${i + 2}`));
  } else if ((ext === 'json' || trimmed.startsWith('[')) && trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed);
    arr.forEach((r, i) => addRecord(r, JSON.stringify(r), `item ${i + 1}`));
  } else if (ext === 'json' && trimmed.startsWith('{') && !trimmed.includes('\n')) {
    const obj = JSON.parse(trimmed);
    const list = obj.events || obj.logs || obj.records;
    if (Array.isArray(list)) list.forEach((r, i) => addRecord(r, JSON.stringify(r), `item ${i + 1}`));
    else addRecord(obj, trimmed, 'record 1');
  } else {
    text.split(/\r?\n/).forEach((line, i) => {
      const l = line.trim();
      if (!l) return;
      try {
        addRecord(l.startsWith('{') ? JSON.parse(l) : parseTextLine(l), l, `line ${i + 1}`);
      } catch {
        total++;
        skipped++;
        if (errors.length < 15) errors.push(`line ${i + 1}: could not parse`);
      }
    });
  }

  events.sort((a, b) => a.ts - b.ts);
  return { events, errors, totalLines: total, skipped };
}

module.exports = { parseLogBuffer };
