/** Runs the parser + analyzer on the sample log without needing MongoDB. Usage: npm test */
const fs = require('fs');
const path = require('path');
const { parseLogBuffer } = require('../services/parser');
const { analyzeUpload, analyzeStudent } = require('../services/analyzer');

const file = path.join(__dirname, '..', '..', 'sample-data', 'exam_sample.log');
if (!fs.existsSync(file)) require('./generateSample');

const { events, errors, skipped } = parseLogBuffer(fs.readFileSync(file), 'exam_sample.log');
console.log(`Parsed ${events.length} events (${skipped} skipped)`, errors.slice(0, 3));

const t0 = Date.now();
const res = analyzeUpload(events);
console.log(`Upload analysis took ${Date.now() - t0} ms; median latency ${res.stats.medianLatency} ms, ${res.incidents.length} incidents`);
res.incidents.forEach((i) =>
  console.log(`  ${i.id} ${i.start.toISOString().slice(11, 16)}-${i.end.toISOString().slice(11, 16)}  ${i.causeLabel} (${Math.round(i.confidence * 100)}%)  flags=${i.flags.join(',')}`)
);

const T = (hhmm) => `2026-10-20T${hhmm}:00Z`;
const cases = [
  ['S105', '09:50', 'network_student'],
  ['S118', '09:40', 'device_browser'],
  ['S131', '11:08', 'session_auth'],
  ['S121', '10:18', 'app_bug'],
  ['S140', '10:07', 'database_bottleneck'],
  ['S150', '10:52', 'server_overload'],
  ['S145', '11:16', 'network_server'],
  ['S112', '10:32', 'third_party'],
  ['S160', '09:40', 'normal'],
];
let failed = 0;
for (const [sid, at, expected] of cases) {
  const when = new Date(T(at));
  const r = analyzeStudent(events, sid, { from: new Date(when - 5 * 60000), to: new Date(+when + 5 * 60000) });
  const ok = r.cause === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${sid} @${at} -> ${r.cause} (${Math.round(r.confidence * 100)}%) expected ${expected}`);
  if (!ok) console.log('   ranking:', r.ranking.map((x) => `${x.cause}:${x.score}`).join(' '));
}
const expectedInc = ['database_bottleneck', 'app_bug', 'third_party', 'misconfiguration', 'server_overload', 'network_server'];
const gotInc = res.incidents.map((i) => i.cause);
const incOk = JSON.stringify(gotInc) === JSON.stringify(expectedInc);
if (!incOk) { failed++; console.log('FAIL incidents:', gotInc.join(', ')); } else console.log('PASS incident causes in order');
process.exit(failed ? 1 : 0);
