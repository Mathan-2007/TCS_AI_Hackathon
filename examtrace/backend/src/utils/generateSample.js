/**
 * Generates a realistic synthetic exam log with known, injected problems.
 * Run: npm run sample   ->  sample-data/exam_sample.log
 *
 * Injected incidents (minute offsets from 09:30 UTC start):
 *   15-32  S105 weak network (student side)         35-42  database bottleneck (all students)
 *   45-50  app bug after a deployment               60-64  proctoring service failure (third party)
 *   70-73  rate limit hit (misconfiguration)        80-87  server overload (CPU/memory)
 *   95-100 S130-S132 token expiry (session/auth)    105-108 load balancer drops
 *   S118 has an old browser and 1.5 GB RAM for the whole exam
 */
const fs = require('fs');
const path = require('path');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);
const between = (a, b) => a + (b - a) * rnd();
const int = (a, b) => Math.round(between(a, b));

const START = Date.parse('2026-10-20T09:30:00Z');
const DURATION = 120;
const students = Array.from({ length: 60 }, (_, i) => ({
  id: `S${101 + i}`,
  idx: i,
  network: rnd() < 0.6 ? 'wifi' : '4g',
  browser: pick(['Chrome/118.0', 'Chrome/119.0', 'Firefox/117.0', 'Edge/118.0']),
  ram: pick([4, 8, 8, 16]),
}));
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
const byId = (id) => students.find((s) => s.id === id);
byId('S118').browser = 'Chrome/49.0';
byId('S118').ram = 1.5;

const rows = [];
function line(ts, level, fields) {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => (typeof v === 'string' && /[\s"]/.test(v) ? `${k}="${v}"` : `${k}=${v}`));
  rows.push({ ts, text: `${new Date(ts).toISOString()} ${level} ${parts.join(' ')}` });
}
const inR = (m, a, b) => m >= a && m <= b;

for (let m = 0; m < DURATION; m++) {
  const t0 = START + m * 60000;

  // system metrics twice a minute
  for (const sec of [10, 40]) {
    const overload = inR(m, 80, 87);
    line(t0 + sec * 1000, 'INFO', {
      source: 'system', event: 'metrics',
      cpu: round(overload ? between(94, 99) : between(30, 45)),
      mem: round(overload ? between(88, 93) : between(55, 65)),
    });
  }

  // database stats once a minute
  const dbSlow = inR(m, 35, 42);
  line(t0 + 20000, dbSlow ? 'WARN' : 'INFO', {
    source: 'db', event: 'query_stats',
    db_query_ms: round(dbSlow ? between(2800, 4200) : inR(m, 80, 87) ? between(100, 180) : between(60, 110)),
    db_pool_used: dbSlow ? int(47, 50) : int(8, 18),
    db_pool_max: 50,
  });
  if (dbSlow) {
    for (let k = 0; k < 3; k++) line(t0 + (25 + k * 8) * 1000, 'ERROR', { source: 'db', event: 'lock_wait', error: 'lock wait timeout on table answers' });
  }

  if (m === 45) line(t0 + 5000, 'INFO', { source: 'app', event: 'deploy', msg: 'deployed build 2026.10.20-rc2' });

  // one request per student per minute
  for (const s of students) {
    const ts = t0 + int(0, 59) * 1000 + int(0, 900);
    const r = rnd();
    const ev = m === DURATION - 2 ? 'submit_exam' : r < 0.6 ? 'question_load' : r < 0.9 ? 'answer_save' : 'heartbeat';
    let latency = between(180, 380);
    let status = 200;
    let level = 'INFO';
    let source = 'web';
    let error;
    let msg;

    if (s.id === 'S118') latency = between(1100, 2000);
    if (s.id === 'S105' && inR(m, 15, 32)) latency = between(1500, 3200);
    if (dbSlow) {
      latency = between(2200, 4200);
      if (rnd() < 0.12) { latency = between(8000, 9500); status = 504; error = 'request timeout'; }
    }
    if (inR(m, 80, 87)) {
      latency = between(1200, 2600);
      if (rnd() < 0.1) { latency = between(5000, 7000); status = 503; error = 'server busy'; }
    }
    if (inR(m, 46, 50) && s.idx % 4 === 0) {
      source = 'app'; status = 500; latency = between(600, 900); error = 'NullPointerException in submitAnswer';
    }
    if (inR(m, 70, 73) && rnd() < 0.3) {
      status = 429; latency = between(30, 80); msg = 'rate limit exceeded: 60 req/min per IP';
    }
    if (inR(m, 105, 108) && s.idx % 4 === 0) {
      status = 502; latency = between(3000, 3600);
      line(ts - 300, 'ERROR', { source: 'lb', student: s.id, event: 'dropped_connection', status: 502 });
    }
    if (inR(m, 95, 100) && ['S130', 'S131', 'S132'].includes(s.id)) {
      status = 401; latency = between(40, 90); error = 'invalid token';
      line(ts - 500, 'WARN', { source: 'auth', student: s.id, session: `sess-${s.id}`, event: 'token_expired', status: 401, error: 'token expired' });
      if (m % 2 === 0) line(ts - 200, 'WARN', { source: 'auth', student: s.id, session: `sess-${s.id}`, event: 'forced_logout', status: 401 });
    }
    if (status >= 500) level = 'ERROR';
    else if (latency > 1000 || status >= 400) level = 'WARN';
    line(ts, level, { source, student: s.id, session: `sess-${s.id}`, event: ev, latency_ms: round(latency), status, error, msg });

    // proctoring service failure (third party)
    if (inR(m, 60, 64) && s.idx % 5 !== 0) {
      line(ts + 400, 'ERROR', {
        source: 'thirdparty', student: s.id, event: 'proctor_stream',
        latency_ms: round(between(5000, 9000)), status: 502, error: 'proctoring upstream unavailable',
      });
    }

    // client telemetry every 2 minutes (every minute for the weak-network student)
    const weak = s.id === 'S105' && inR(m, 15, 32);
    if (weak || m % 2 === 0) {
      line(ts + 700, weak ? 'WARN' : 'INFO', {
        source: 'client', student: s.id, event: 'telemetry',
        rtt_ms: round(weak ? between(600, 950) : between(35, 90)),
        packet_loss: round(weak ? between(5, 10) : between(0, 0.6), 1),
        browser: s.browser, device_ram_gb: s.ram, network: weak ? '4g' : s.network,
      });
      if (weak && m % 4 === 0) line(ts + 900, 'WARN', { source: 'client', student: s.id, event: 'network_offline', msg: 'connection lost for 6s' });
    }
  }
}

function round(x, d = 0) { const p = 10 ** d; return Math.round(x * p) / p; }

rows.sort((a, b) => a.ts - b.ts);
const out = path.join(__dirname, '..', '..', 'sample-data', 'exam_sample.log');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, rows.map((r) => r.text).join('\n') + '\n');
console.log(`Wrote ${rows.length} log lines to ${out}`);
