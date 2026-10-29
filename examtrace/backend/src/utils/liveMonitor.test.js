const assert = require('assert');
const { buildObserverEvents, summarizeObserverFeed } = require('../services/liveMonitor');

const snapshot = {
  summary: { hostname: 'exam-host', cpu_usage_pct: 86, memory_usage_pct: 92 },
  systemMetrics: [
    { timestamp: '2026-10-20T09:31:00Z', cpu_usage_pct: 82, memory_usage_pct: 84 },
    { timestamp: '2026-10-20T09:32:00Z', cpu_usage_pct: 91, memory_usage_pct: 95 },
  ],
  requests: [
    { timestamp: '2026-10-20T09:31:00Z', method: 'POST', path: '/api/submit', status_code: 500, response_time_ms: 1800, client_ip: '10.0.0.5' },
    { timestamp: '2026-10-20T09:31:30Z', method: 'POST', path: '/submit', status_code: 429, response_time_ms: 2100, client_ip: '10.0.0.5' },
  ],
  assessmentEvents: [
    { timestamp: '2026-10-20T09:31:05Z', event: 'assessment_submitted', username: 'student1', score: 12, total: 20 },
  ],
};

const events = buildObserverEvents(snapshot);
assert.ok(events.length > 0, 'observer events should be normalized');
assert.ok(events.some((e) => e.source === 'observer' && e.cpu === 91), 'system metrics should be converted to AI events');
assert.ok(events.some((e) => e.status === 500), 'request errors should remain visible to the AI');

const summary = summarizeObserverFeed(snapshot);
assert.ok(summary.stats && summary.stats.requests > 0, 'summary should include request stats');
assert.ok(summary.incidents.length >= 0, 'summary should include incident analysis');

console.log('live monitor bridge test: PASS');
