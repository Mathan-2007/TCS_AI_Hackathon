/**
 * Anomaly detection + root cause classification.
 *
 * Pipeline
 *  1. Group events into 1-minute windows and extract features (latency, error rate, CPU, DB, auth ...).
 *  2. Flag anomalous windows with a robust z-score (median/MAD) plus hard thresholds.
 *  3. Merge neighbouring anomalous windows into incidents.
 *  4. Score every root-cause category from weighted signals (each signal is shown as a "factor" so
 *     the result is explainable) and turn the scores into a confidence value.
 *  5. Attach evidence log lines, a plain-language explanation and recommended fixes.
 *
 * The scoring is a transparent rule-based model. See README for how to swap in a trained
 * ML model (e.g. XGBoost + SHAP) behind scoreCauses().
 */

const MINUTE = 60000;
const clamp = (x, lo = 0, hi = 1) => (Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : 0);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const max = (a) => (a.length ? Math.max(...a) : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const round = (x, d = 0) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);
const num = (x) => (x == null ? 'n/a' : round(x));
const gt = (v, t) => typeof v === 'number' && v > t;
const gte = (v, t) => typeof v === 'number' && v >= t;
const lte = (v, t) => typeof v === 'number' && v <= t;
const hm = (d) => new Date(d).toISOString().slice(11, 16);
const keyOf = (e) => Math.floor(new Date(e.ts).getTime() / MINUTE);

const TP_SOURCES = new Set(['thirdparty', 'third_party', 'cdn', 'proctoring', 'storage', 'video']);
const OLD_BROWSER = /(MSIE|Trident|\bIE\b|Chrome\/[1-6]\d(\.|\b)|Firefox\/[1-5]\d(\.|\b))/i;
const TIMEOUT_RE = /time(d)?[\s_-]?out/i;

const CAUSES = {
  server_overload: {
    label: 'Server overload',
    fixes: [
      'Scale out application servers or enable autoscaling before the exam starts',
      'Run a load test with the expected number of concurrent students (JMeter, k6 or Locust)',
      'Stagger exam start times or add a waiting-room queue',
    ],
  },
  database_bottleneck: {
    label: 'Database bottleneck',
    fixes: [
      'Add indexes for the slowest queries and review the query plans',
      'Increase the connection pool size and set sensible pool timeouts',
      'Cache question papers in memory instead of reading them from the database for every student',
    ],
  },
  network_server: {
    label: 'Network issue (server side)',
    fixes: [
      'Check load balancer health checks and connection limits',
      'Review bandwidth usage on the data-centre or college uplink during the exam',
      'Add a second upstream link or serve static content from a CDN',
    ],
  },
  network_student: {
    label: 'Network issue (student side)',
    fixes: [
      'Ask the student to use a wired or stronger Wi-Fi connection during exams',
      'Offer a retake or extra time if the exam rules allow it',
      'Enable auto-save and reconnect handling so short drops do not lose answers',
    ],
  },
  app_bug: {
    label: 'Application bug',
    fixes: [
      'Roll back or hot-fix the release that introduced the errors',
      'Fix the exception shown in the evidence and add a regression test',
      'Run a smoke test of submit and save flows after every deployment',
    ],
  },
  session_auth: {
    label: 'Session / authentication issue',
    fixes: [
      'Extend token lifetime for the exam duration and refresh tokens silently',
      'Check for clock drift between servers that issue and verify tokens',
      'Allow students to resume the same attempt after signing in again',
    ],
  },
  device_browser: {
    label: 'Device / browser issue',
    fixes: [
      'Publish minimum browser and device requirements before the exam',
      'Add a pre-exam system check page that tests browser version, RAM and bandwidth',
      'Offer a lab machine or alternative device to the student',
    ],
  },
  third_party: {
    label: 'Third-party service failure',
    fixes: [
      'Contact the provider (proctoring, CDN, storage) and check their status page',
      'Add timeouts and a fallback so the exam keeps working when the provider is down',
      'Decouple proctoring uploads from the answer-saving path',
    ],
  },
  misconfiguration: {
    label: 'Misconfiguration',
    fixes: [
      'Raise or remove per-IP rate limits, since many students share one college IP address',
      'Review timeout, cache and proxy settings against expected exam traffic',
      'Keep exam-day configuration in version control and review it before every exam',
    ],
  },
  normal: {
    label: 'No issue found in logs',
    fixes: [
      'Ask the student for the exact time, device and network used',
      'Check client-side telemetry if it was not captured in this log file',
      'Reply to the student with the findings and close the complaint',
    ],
  },
};

/* ---------- event predicates ---------- */
const isRequest = (e) => typeof e.latencyMs === 'number';
const isTimeout = (e) => e.status === 504 || e.status === 408 || TIMEOUT_RE.test(`${e.event || ''} ${e.error || ''}`);
const isServerFailure = (e) => gte(e.status, 500) || e.status === 429 || isTimeout(e);
const isStudentFailure = (e) => isServerFailure(e) || e.status === 401 || e.status === 403;

const EVIDENCE = {
  server_overload: (e) => gte(e.cpu, 85) || gte(e.mem, 85),
  database_bottleneck: (e, b) =>
    gte(e.dbQueryMs, Math.max(b.dbBase || 0, 20) * 3) || /lock|deadlock|pool/i.test(`${e.event || ''} ${e.error || ''}`),
  network_server: (e) => e.source === 'lb' && (gte(e.status, 502) || /drop|reset/i.test(e.event || '')),
  network_student: (e) => gt(e.rttMs, 300) || gt(e.packetLoss, 3) || /offline|disconnect/i.test(e.event || ''),
  app_bug: (e) => e.source === 'app' && !!e.error && !isTimeout(e),
  session_auth: (e) =>
    e.source === 'auth' && (e.status === 401 || e.status === 403 || /expire|forced_logout|invalid/i.test(`${e.event || ''} ${e.error || ''}`)),
  device_browser: (e) => lte(e.deviceRamGb, 2) || OLD_BROWSER.test(e.browser || ''),
  third_party: (e) => TP_SOURCES.has(e.source) && (gte(e.status, 500) || !!e.error),
  misconfiguration: (e) => e.status === 429 || /rate.?limit|misconfig/i.test(`${e.error || ''} ${e.msg || ''}`),
};
const STUDENT_SPECIFIC = new Set(['network_student', 'device_browser', 'session_auth', 'app_bug', 'misconfiguration']);

const fmtEvent = (e) =>
  e.raw ||
  `${new Date(e.ts).toISOString()} ${e.level} source=${e.source}${e.student ? ` student=${e.student}` : ''} event=${e.event || '-'}` +
    `${e.latencyMs != null ? ` latency_ms=${e.latencyMs}` : ''}${e.status != null ? ` status=${e.status}` : ''}${e.error ? ` error="${e.error}"` : ''}`;

function pickEvidence(cause, events, base, n = 8) {
  const f = EVIDENCE[cause];
  if (!f) return [];
  const hits = events.filter((e) => f(e, base));
  if (hits.length <= n) return hits.map(fmtEvent);
  const step = hits.length / n;
  return Array.from({ length: n }, (_, i) => hits[Math.floor(i * step)]).map(fmtEvent);
}

/* ---------- step 1: windows ---------- */
function windowFeatures(key, evs) {
  const reqs = evs.filter(isRequest);
  const lat = reqs.map((e) => e.latencyMs);
  const cpu = evs.filter((e) => e.cpu != null).map((e) => e.cpu);
  const mem = evs.filter((e) => e.mem != null).map((e) => e.mem);
  const dbq = evs.filter((e) => e.dbQueryMs != null).map((e) => e.dbQueryMs);
  const pools = evs.filter((e) => e.dbPoolUsed != null && e.dbPoolMax).map((e) => e.dbPoolUsed / e.dbPoolMax);
  const students = new Set(evs.filter((e) => e.student).map((e) => e.student));
  const failures = reqs.filter(isServerFailure).length;
  return {
    key,
    ts: new Date(key * MINUTE).toISOString(),
    requests: reqs.length,
    avgLatency: round(mean(lat)),
    p95Latency: round(pct(lat, 0.95)),
    errorRate: reqs.length ? round(failures / reqs.length, 3) : 0,
    timeouts: evs.filter(isTimeout).length,
    cpuMax: max(cpu),
    memMax: max(mem),
    dbQueryAvg: round(mean(dbq)),
    dbPoolUtil: max(pools),
    lockWaits: evs.filter((e) => /lock|deadlock/i.test(`${e.event || ''} ${e.error || ''}`)).length,
    authFailures: evs.filter(EVIDENCE.session_auth).length,
    tpErrors: evs.filter(EVIDENCE.third_party).length,
    lbDrops: evs.filter(EVIDENCE.network_server).length,
    appExceptions: evs.filter(EVIDENCE.app_bug).length,
    misconfig: evs.filter(EVIDENCE.misconfiguration).length,
    students: students.size,
    flags: [],
  };
}

function buildWindows(events) {
  const map = new Map();
  for (const e of events) {
    const k = keyOf(e);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return [...map.keys()].sort((a, b) => a - b).map((k) => windowFeatures(k, map.get(k)));
}

/* ---------- step 2: baselines + anomaly flags ---------- */
function baselines(windows, events) {
  const lat = windows.filter((w) => w.requests > 0).map((w) => w.avgLatency);
  const med = median(lat) || 0;
  const mad = median(lat.map((x) => Math.abs(x - med))) || 0;
  const dbs = windows.filter((w) => w.dbQueryAvg != null).map((w) => w.dbQueryAvg);
  const conc = windows.map((w) => w.students).filter((x) => x > 0);
  return {
    medianLatency: med,
    madLatency: mad,
    dbBase: median(dbs) || 0,
    concBase: median(conc) || 1,
    slowMs: Math.max(2.5 * med, 800),
  };
}

function flagWindows(windows, base) {
  for (const w of windows) {
    w.flags = [];
    if (w.requests > 0) {
      const z = (0.6745 * (w.avgLatency - base.medianLatency)) / Math.max(base.madLatency, 0.1 * base.medianLatency, 1);
      w.zScore = round(z, 1);
      if (z > 3.5 && w.avgLatency > 1.5 * base.medianLatency) w.flags.push('latency_spike');
      if (w.errorRate > 0.08) w.flags.push('error_rate');
    }
    if (w.timeouts >= 3) w.flags.push('timeouts');
    if (gte(w.cpuMax, 92)) w.flags.push('cpu_saturation');
    if (w.dbQueryAvg != null && w.dbQueryAvg > 300 && w.dbQueryAvg >= 4 * Math.max(base.dbBase, 20)) w.flags.push('db_slow');
  }
}

/* ---------- step 3/4: scoring ---------- */
function aggregate(wins) {
  const nz = (a) => a.filter((x) => x != null);
  return {
    cpuMax: max(nz(wins.map((w) => w.cpuMax))),
    memMax: max(nz(wins.map((w) => w.memMax))),
    dbQueryAvg: mean(nz(wins.map((w) => w.dbQueryAvg))),
    dbPoolUtil: max(nz(wins.map((w) => w.dbPoolUtil))),
    lockWaits: sum(wins.map((w) => w.lockWaits)),
    tpErrors: sum(wins.map((w) => w.tpErrors)),
    lbDrops: sum(wins.map((w) => w.lbDrops)),
    appExceptions: sum(wins.map((w) => w.appExceptions)),
    misconfig: sum(wins.map((w) => w.misconfig)),
    authFailures: sum(wins.map((w) => w.authFailures)),
    concPeak: max(wins.map((w) => w.students)) || 0,
  };
}

function scoreCauses(c, base) {
  const S = Object.fromEntries(Object.keys(CAUSES).map((k) => [k, { score: 0, factors: [] }]));
  const add = (cause, label, v, w) => {
    const x = clamp(v) * w;
    S[cause].score += x;
    if (x >= 0.02) S[cause].factors.push({ label, weight: +x.toFixed(2) });
  };
  const healthy = c.serverHealthy ? 1 : 0.5;

  add('server_overload', 'CPU above 70%', ((c.cpuMax ?? 0) - 70) / 25, 0.5);
  add('server_overload', 'Memory above 75%', ((c.memMax ?? 0) - 75) / 20, 0.2);
  add('server_overload', 'More concurrent users than normal', (c.concPeak / Math.max(base.concBase, 1) - 1.3) / 1.5, 0.3);

  if (c.dbQueryAvg != null) add('database_bottleneck', 'Query time far above normal', (c.dbQueryAvg / Math.max(base.dbBase, 20) - 2) / 6, 0.5);
  add('database_bottleneck', 'Connection pool nearly full', ((c.dbPoolUtil ?? 0) - 0.8) / 0.2, 0.3);
  add('database_bottleneck', 'Lock waits recorded', c.lockWaits / 5, 0.2);

  add('network_server', 'Load balancer drops / gateway errors', c.lbDrops / 4, 0.8);
  add('network_student', 'Poor client network (RTT, packet loss, offline events)', c.clientShare, 0.8 * healthy);

  add('app_bug', 'Application exceptions', c.appExceptions / 5, 0.6);
  if (c.appExceptions > 0) add('app_bug', 'Deployment shortly before the errors', c.deployNearby ? 1 : 0, 0.3);

  add('session_auth', 'Token expiry / forced logouts', c.authFailures / 5, 0.9);
  add('device_browser', 'Old browser or low device memory', c.deviceShare, 0.7 * healthy);
  add('third_party', 'Third-party service errors', c.tpErrors / 5, 0.9);
  add('misconfiguration', 'Rate-limit or config errors (HTTP 429)', c.misconfig / 5, 0.8);

  const top = Math.max(...Object.entries(S).filter(([k]) => k !== 'normal').map(([, v]) => v.score));
  S.normal.score = top < 0.2 ? 0.3 : 0;

  const total = sum(Object.values(S).map((v) => v.score)) || 1;
  const ranking = Object.entries(S)
    .map(([cause, v]) => ({ cause, label: CAUSES[cause].label, score: +v.score.toFixed(3), share: +(v.score / total).toFixed(3) }))
    .sort((a, b) => b.score - a.score);
  const best = ranking[0];
  const confidence = best.cause === 'normal' ? 0.8 : +clamp(best.score * 0.6 + best.share * 0.4, 0.2, 0.97).toFixed(2);
  return { cause: best.cause, confidence, ranking: ranking.filter((r) => r.score > 0).slice(0, 5), factors: S[best.cause].factors };
}

function explainText(cause, c, ctx) {
  const t = ctx.range ? `Between ${hm(ctx.range.start)} and ${hm(ctx.range.end)} UTC, ` : '';
  switch (cause) {
    case 'server_overload':
      return `${t}server CPU peaked at ${num(c.cpuMax)}% and memory at ${num(c.memMax)}% with up to ${c.concPeak} students active (typical: ${num(ctx.base.concBase)}). Requests queued on the server and response times rose sharply.`;
    case 'database_bottleneck':
      return `${t}database queries averaged ${num(c.dbQueryAvg)} ms against a normal level of about ${num(ctx.base.dbBase)} ms. The connection pool reached ${num((c.dbPoolUtil ?? 0) * 100)}% and ${c.lockWaits} lock waits were recorded, so question loading and saving stalled.`;
    case 'network_server':
      return `${t}the load balancer recorded ${num(c.lbDrops)} dropped connections or gateway errors. Requests failed before reaching the application, which students experience as freezing or reconnecting.`;
    case 'network_student':
      return `${t}this student's own connection was unstable: round-trip time averaged ${num(ctx.rttAvg)} ms, packet loss ${num(ctx.lossAvg)}%, with ${ctx.offline} offline events, while server-side metrics were ${c.serverHealthy ? 'normal' : 'only partly affected'}. The slowness most likely came from the student's network.`;
    case 'app_bug':
      return `${t}${c.appExceptions} application exceptions were logged${c.deployNearby ? ', shortly after a new deployment' : ''}. Requests failed with HTTP 500 even though CPU, database and network were healthy, which points to a defect in the application code.`;
    case 'session_auth':
      return `${t}${c.authFailures} authentication events (expired tokens or forced logouts) were recorded for this student. Server performance was normal, so the repeated sign-outs came from session handling.`;
    case 'device_browser':
      return `${t}this student's device is below the recommended spec (${ctx.browser || 'old browser'}${ctx.ram != null ? `, ${ctx.ram} GB RAM` : ''}). Network round-trip time was normal and servers were healthy, so rendering and script execution on the device caused the slowness.`;
    case 'third_party':
      return `${t}${num(c.tpErrors)} errors came from an external service such as proctoring, CDN or storage. These calls were slow or failing and held up the exam pages that depend on them.`;
    case 'misconfiguration':
      return `${t}${c.misconfig} requests were rejected with HTTP 429 (rate limit exceeded) while servers were otherwise healthy. A limit set for normal traffic blocked students, probably because they share a single college IP address.`;
    default:
      return ctx.normalText || 'No abnormal latency, errors or resource pressure were found in the logs for this period.';
  }
}

function describeIncident(g, idx, events, base) {
  const start = new Date(g.startKey * MINUTE);
  const end = new Date((g.endKey + 1) * MINUTE);
  const evs = events.filter((e) => e.ts >= start && e.ts < end);
  const affected = new Set(evs.filter((e) => e.student && isRequest(e) && (e.latencyMs > base.slowMs || isServerFailure(e))).map((e) => e.student));
  const hasSignal = (pred) => {
    const s = new Set(evs.filter((e) => e.student && affected.has(e.student) && pred(e)).map((e) => e.student));
    return s.size / Math.max(affected.size, 1);
  };
  const c = {
    ...aggregate(g.wins),
    clientShare: hasSignal(EVIDENCE.network_student),
    deviceShare: hasSignal(EVIDENCE.device_browser),
    deployNearby: events.some((e) => /deploy|release|rollout/i.test(e.event || '') && e.ts >= new Date(start - 15 * MINUTE) && e.ts <= end),
    serverHealthy: false,
  };
  const cls = scoreCauses(c, base);
  const flags = [...new Set(g.wins.flatMap((w) => w.flags))];
  const range = { start, end };
  return {
    id: `INC-${idx + 1}`,
    start,
    end,
    durationMin: g.endKey - g.startKey + 1,
    flags,
    avgLatency: round(mean(g.wins.map((w) => w.avgLatency).filter((x) => x != null))),
    peakLatency: max(g.wins.map((w) => w.p95Latency).filter((x) => x != null)),
    errorRate: round(max(g.wins.map((w) => w.errorRate)), 3),
    affectedStudents: affected.size,
    cause: cls.cause,
    causeLabel: CAUSES[cls.cause].label,
    confidence: cls.confidence,
    ranking: cls.ranking,
    factors: cls.factors,
    evidence: pickEvidence(cls.cause, evs, base),
    explanation: explainText(cls.cause, c, { base, range }),
    recommendations: CAUSES[cls.cause].fixes,
  };
}

function buildIncidents(windows, events, base) {
  const groups = [];
  let cur = null;
  for (const w of windows.filter((x) => x.flags.length)) {
    if (cur && w.key - cur.endKey <= 2) {
      cur.wins.push(w);
      cur.endKey = w.key;
    } else {
      cur = { startKey: w.key, endKey: w.key, wins: [w] };
      groups.push(cur);
    }
  }
  return groups.map((g, i) => describeIncident(g, i, events, base));
}

/* ---------- whole-upload analysis ---------- */
function analyzeUpload(events) {
  const windows = buildWindows(events);
  const base = baselines(windows, events);
  flagWindows(windows, base);
  const incidents = buildIncidents(windows, events, base);

  const reqs = events.filter(isRequest);
  const lat = reqs.map((e) => e.latencyMs);
  const students = new Map();
  for (const e of reqs) {
    if (!e.student) continue;
    const s = students.get(e.student) || { studentId: e.student, requests: 0, problemRequests: 0 };
    s.requests++;
    if (e.latencyMs > base.slowMs || isStudentFailure(e)) s.problemRequests++;
    students.set(e.student, s);
  }
  const count = (key) => events.reduce((acc, e) => ((acc[e[key]] = (acc[e[key]] || 0) + 1), acc), {});
  const causeSummary = incidents.reduce((acc, i) => ((acc[i.cause] = (acc[i.cause] || 0) + 1), acc), {});

  return {
    stats: {
      events: events.length,
      requests: reqs.length,
      students: new Set(events.filter((e) => e.student).map((e) => e.student)).size,
      start: events[0]?.ts,
      end: events[events.length - 1]?.ts,
      medianLatency: round(median(lat)),
      p95Latency: round(pct(lat, 0.95)),
      errorRate: reqs.length ? round(reqs.filter(isServerFailure).length / reqs.length, 3) : 0,
      peakConcurrent: max(windows.map((w) => w.students)) || 0,
      sources: count('source'),
      levels: count('level'),
    },
    base: { ...base, medianLatency: round(base.medianLatency), slowMs: round(base.slowMs) },
    windows: windows.map(({ ts, avgLatency, p95Latency, errorRate, cpuMax, memMax, dbQueryAvg, students: st, requests, flags }) => ({
      ts, avgLatency, p95Latency, errorRate, cpuMax, memMax, dbQueryAvg, students: st, requests, flags,
    })),
    incidents,
    causeSummary,
    topAffected: [...students.values()]
      .filter((s) => s.problemRequests > 0)
      .sort((a, b) => b.problemRequests - a.problemRequests)
      .slice(0, 12)
      .map((s) => ({ ...s, ratio: round(s.problemRequests / s.requests, 2) })),
  };
}

/* ---------- one student (complaint) ---------- */
function analyzeStudent(allEvents, studentId, opts = {}) {
  const from = opts.from ? new Date(opts.from) : null;
  const to = opts.to ? new Date(opts.to) : null;
  const inRange = (e) => (!from || e.ts >= from) && (!to || e.ts <= to);

  const windows = buildWindows(allEvents);
  const base = baselines(windows, allEvents);
  flagWindows(windows, base);
  const winMap = new Map(windows.map((w) => [w.key, w]));

  const events = allEvents.filter(inRange);
  const mine = events.filter((e) => e.student === studentId);
  const window = { from: from || allEvents[0]?.ts, to: to || allEvents[allEvents.length - 1]?.ts };

  const result = { studentId, window, serverMedianLatency: round(base.medianLatency) };
  if (!mine.length) {
    return {
      ...result,
      verdict: 'no_data',
      cause: 'normal',
      causeLabel: 'No log data for this student',
      confidence: 0,
      explanation: `No log events were found for ${studentId} in this time window. Check the student ID and that the uploaded log covers the exam time.`,
      recommendations: ['Confirm the student ID matches the one written in the logs', 'Upload the log file that covers the complaint time'],
      evidence: [],
      ranking: [],
      factors: [],
      stats: { events: 0 },
      timeline: [],
    };
  }

  const reqs = mine.filter(isRequest);
  const problem = reqs.filter((e) => e.latencyMs > base.slowMs || isStudentFailure(e));
  const lat = reqs.map((e) => e.latencyMs);
  const stats = {
    events: mine.length,
    requests: reqs.length,
    problemRequests: problem.length,
    failedRequests: reqs.filter(isStudentFailure).length,
    avgLatency: round(mean(lat)),
    p95Latency: round(pct(lat, 0.95)),
  };

  // timeline: student latency vs platform latency and CPU, per minute
  const myByKey = new Map();
  for (const e of reqs) {
    const k = keyOf(e);
    if (!myByKey.has(k)) myByKey.set(k, []);
    myByKey.get(k).push(e.latencyMs);
  }
  const timeline = windows
    .filter((w) => (!from || w.key * MINUTE >= from.getTime() - MINUTE) && (!to || w.key * MINUTE <= to.getTime()))
    .map((w) => ({
      ts: w.ts,
      studentLatency: myByKey.has(w.key) ? round(mean(myByKey.get(w.key))) : null,
      serverLatency: w.avgLatency,
      cpu: w.cpuMax,
      anomaly: w.flags.length > 0,
    }));

  if (!problem.length) {
    const platformIncidents = windows.filter((w) => w.flags.length && (!from || w.key * MINUTE >= from.getTime()) && (!to || w.key * MINUTE <= to.getTime())).length;
    return {
      ...result,
      verdict: 'not_supported',
      cause: 'normal',
      causeLabel: CAUSES.normal.label,
      confidence: 0.9,
      ranking: [{ cause: 'normal', label: CAUSES.normal.label, score: 1, share: 1 }],
      factors: [],
      evidence: [],
      stats,
      timeline,
      explanation:
        `No slow or failed requests were found for ${studentId} in this period. Average latency was ${num(stats.avgLatency)} ms against a platform median of ${num(base.medianLatency)} ms.` +
        (platformIncidents ? ` Platform-wide problems were detected in ${platformIncidents} other minute(s), but this student's requests were not affected.` : '') +
        ' The complaint is not supported by the backend logs.',
      recommendations: CAUSES.normal.fixes,
    };
  }

  const affectedKeys = new Set(problem.map(keyOf));
  const nearKeys = new Set();
  affectedKeys.forEach((k) => [k - 1, k, k + 1].forEach((x) => nearKeys.add(x)));
  const affWins = [...affectedKeys].map((k) => winMap.get(k)).filter(Boolean);
  const anomalousShare = affWins.filter((w) => w.flags.length).length / Math.max(affWins.length, 1);
  const agg = aggregate(affWins);
  const own = mine.filter((e) => nearKeys.has(keyOf(e)));

  const netBad = own.filter(EVIDENCE.network_student);
  const minKey = Math.min(...affectedKeys);
  const maxKey = Math.max(...affectedKeys);
  const c = {
    cpuMax: agg.cpuMax,
    memMax: agg.memMax,
    concPeak: agg.concPeak,
    dbQueryAvg: agg.dbQueryAvg,
    dbPoolUtil: agg.dbPoolUtil,
    lockWaits: Math.round(agg.lockWaits * anomalousShare),
    lbDrops: Math.max(own.filter(EVIDENCE.network_server).length, Math.round(agg.lbDrops * anomalousShare)),
    tpErrors: Math.max(own.filter(EVIDENCE.third_party).length, Math.round(agg.tpErrors * anomalousShare)),
    appExceptions: own.filter(EVIDENCE.app_bug).length,
    authFailures: own.filter(EVIDENCE.session_auth).length,
    misconfig: own.filter(EVIDENCE.misconfiguration).length,
    clientShare: clamp(netBad.length / 3),
    deviceShare: own.some(EVIDENCE.device_browser) ? 1 : 0,
    serverHealthy: anomalousShare < 0.3,
    deployNearby: allEvents.some(
      (e) => /deploy|release|rollout/i.test(e.event || '') && e.ts >= new Date((minKey - 15) * MINUTE) && e.ts <= new Date((maxKey + 1) * MINUTE)
    ),
  };

  const cls = scoreCauses(c, base);
  const rtts = own.filter((e) => e.rttMs != null).map((e) => e.rttMs);
  const losses = own.filter((e) => e.packetLoss != null).map((e) => e.packetLoss);
  const devEv = [...own].reverse().find((e) => e.browser || e.deviceRamGb != null) || {};
  const range = { start: new Date(minKey * MINUTE), end: new Date((maxKey + 1) * MINUTE) };

  const candidates = STUDENT_SPECIFIC.has(cls.cause) ? own : events.filter((e) => affectedKeys.has(keyOf(e)));
  return {
    ...result,
    verdict: 'confirmed',
    cause: cls.cause,
    causeLabel: CAUSES[cls.cause].label,
    confidence: cls.confidence,
    ranking: cls.ranking,
    factors: cls.factors,
    serverHealthy: c.serverHealthy,
    affectedMinutes: affectedKeys.size,
    stats,
    timeline,
    evidence: pickEvidence(cls.cause, candidates, base),
    explanation: explainText(cls.cause, c, {
      base,
      range,
      rttAvg: mean(rtts),
      lossAvg: mean(losses),
      offline: own.filter((e) => /offline|disconnect/i.test(e.event || '')).length,
      browser: devEv.browser,
      ram: devEv.deviceRamGb,
    }),
    recommendations: CAUSES[cls.cause].fixes,
  };
}

module.exports = { analyzeUpload, analyzeStudent, CAUSES };
