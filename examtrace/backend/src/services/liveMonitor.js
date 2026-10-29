const { analyzeUpload } = require('./analyzer');

function parseObserverTime(value, fallback = new Date()) {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function normalizeHttpStatus(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildObserverEvents(snapshot = {}) {
  const summary = snapshot.summary || {};
  const systemMetrics = Array.isArray(snapshot.systemMetrics) ? snapshot.systemMetrics : [];
  const requests = Array.isArray(snapshot.requests) ? snapshot.requests : [];
  const assessmentEvents = Array.isArray(snapshot.assessmentEvents) ? snapshot.assessmentEvents : [];

  const events = [];

  const pushEvent = (record) => {
    if (!record || !record.timestamp) return;
    const ev = {
      ts: parseObserverTime(record.timestamp),
      level: record.level || 'INFO',
      source: record.source || 'observer',
      event: record.event || 'observer_metric',
      status: normalizeHttpStatus(record.status || record.status_code),
      latencyMs: record.latencyMs ?? record.response_time_ms,
      cpu: record.cpu ?? record.cpu_usage_pct,
      mem: record.mem ?? record.memory_usage_pct,
      dbQueryMs: record.dbQueryMs ?? record.db_query_time_ms,
      student: record.student || record.username || record.user || record.client_ip,
      error: record.error || record.message,
      msg: record.msg || record.message,
      raw: JSON.stringify(record),
    };
    if (ev.student && typeof ev.student === 'string' && ev.student.length > 120) ev.student = ev.student.slice(0, 120);
    events.push(ev);
  };

  if (summary && (summary.hostname || summary.cpu_usage_pct != null || summary.memory_usage_pct != null)) {
    pushEvent({
      timestamp: new Date().toISOString(),
      source: 'observer',
      event: 'host_summary',
      level: 'INFO',
      cpu_usage_pct: summary.cpu_usage_pct,
      memory_usage_pct: summary.memory_usage_pct,
      status: 200,
    });
  }

  systemMetrics.forEach((metric) => pushEvent({
    timestamp: metric.timestamp || new Date().toISOString(),
    source: 'observer',
    event: 'system_metric',
    level: 'INFO',
    cpu_usage_pct: metric.cpu_usage_pct,
    memory_usage_pct: metric.memory_usage_pct,
    status: 200,
  }));

  requests.forEach((request) => {
    const status = normalizeHttpStatus(request.status_code);
    pushEvent({
      timestamp: request.timestamp || new Date().toISOString(),
      source: request.source || 'web',
      event: request.path || request.route || 'http_request',
      level: status && status >= 400 ? 'WARN' : 'INFO',
      latencyMs: request.response_time_ms,
      status,
      student: request.student || request.username || request.client_ip,
      msg: `${request.method || 'GET'} ${request.path || 'request'}`,
      error: status && status >= 500 ? 'server_error' : undefined,
    });
  });

  assessmentEvents.forEach((event) => pushEvent({
    timestamp: event.timestamp || new Date().toISOString(),
    source: event.source || 'app',
    event: event.event || 'assessment_event',
    level: 'INFO',
    status: normalizeHttpStatus(event.status) || 200,
    student: event.username || event.student || event.user,
    msg: event.message || event.event,
  }));

  return events.sort((a, b) => a.ts - b.ts);
}

function summarizeObserverFeed(snapshot = {}) {
  const events = buildObserverEvents(snapshot);
  const analysis = events.length ? analyzeUpload(events) : {
    stats: { events: 0, requests: 0, students: 0, start: null, end: null },
    incidents: [],
    causeSummary: {},
    topAffected: [],
  };

  const summary = snapshot.summary || {};
  const cpu = typeof summary.cpu_usage_pct === 'number' ? summary.cpu_usage_pct : null;
  const memory = typeof summary.memory_usage_pct === 'number' ? summary.memory_usage_pct : null;

  return {
    source: 'observer-lab',
    fetchedAt: new Date().toISOString(),
    monitor: {
      hostname: summary.hostname || 'unknown-host',
      cpuUsagePct: cpu,
      memoryUsagePct: memory,
      platform: summary.platform || 'unknown-platform',
      cpuModel: summary.cpu_model || 'unknown',
      cpuCores: summary.cpu_cores || 0,
    },
    stats: analysis.stats,
    incidents: analysis.incidents,
    causeSummary: analysis.causeSummary,
    topAffected: analysis.topAffected,
    aiStatus: analysis.incidents.length ? 'AI detected live incidents' : 'AI is monitoring; no active incident boundary detected',
    eventsAnalyzed: events.length,
  };
}

module.exports = {
  buildObserverEvents,
  summarizeObserverFeed,
};
