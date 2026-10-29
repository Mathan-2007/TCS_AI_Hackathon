const router = require('express').Router();
const { summarizeObserverFeed } = require('../services/liveMonitor');
const wrap = require('../utils/asyncHandler');

async function fetchObserverSnapshot({ baseUrl, adminToken }) {
  const headers = { 'X-Admin-Token': adminToken };
  const [summary, requests, system, events] = await Promise.all([
    fetch(`${baseUrl}/api/admin/summary`, { headers }).then((r) => r.ok ? r.json() : Promise.reject(new Error('Observer summary unavailable'))),
    fetch(`${baseUrl}/api/admin/logs/requests`, { headers }).then((r) => r.ok ? r.json() : Promise.reject(new Error('Observer requests log unavailable'))),
    fetch(`${baseUrl}/api/admin/logs/system`, { headers }).then((r) => r.ok ? r.json() : Promise.reject(new Error('Observer system log unavailable'))),
    fetch(`${baseUrl}/api/admin/logs/events`, { headers }).then((r) => r.ok ? r.json() : Promise.reject(new Error('Observer events log unavailable'))),
  ]);

  return {
    summary,
    requests: (requests.lines || []).map((line) => (line && line.timestamp ? line : { timestamp: new Date().toISOString(), ...line })),
    systemMetrics: (system.lines || []).filter(Boolean),
    assessmentEvents: (events.lines || []).filter(Boolean),
  };
}

router.get('/observer', wrap(async (_req, res) => {
  const baseUrl = process.env.OBSERVER_BASE_URL || 'http://localhost:3000';
  const adminToken = process.env.OBSERVER_ADMIN_TOKEN || 'change-this-demo-admin-token';

  try {
    const snapshot = await fetchObserverSnapshot({ baseUrl, adminToken });
    const summary = summarizeObserverFeed(snapshot);
    res.json({ ok: true, ...summary });
  } catch (error) {
    res.status(503).json({
      ok: false,
      source: 'observer-lab',
      status: 'unavailable',
      message: error.message || 'Unable to reach the observer lab right now.',
      incidents: [],
      aiStatus: 'observer lab is offline; AI wait mode enabled',
    });
  }
}));

router.get('/observer/health', wrap(async (_req, res) => {
  const baseUrl = process.env.OBSERVER_BASE_URL || 'http://localhost:3000';
  const adminToken = process.env.OBSERVER_ADMIN_TOKEN || 'change-this-demo-admin-token';

  try {
    const summary = await fetch(`${baseUrl}/api/health`, { headers: { 'X-Admin-Token': adminToken } }).then((r) => r.ok ? r.json() : Promise.reject(new Error('Observer health is not reachable')));
    res.json({ ok: true, source: 'observer-lab', ...summary });
  } catch (error) {
    res.status(503).json({ ok: false, source: 'observer-lab', message: error.message || 'Unable to reach the observer lab.' });
  }
}));

module.exports = router;
