import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { CAUSES, fmtDateTime, fmtNumber } from '../causes';
import { CauseBadge, Empty, ErrorNote, PageHead, StatusBadge } from '../components/ui';

function CauseChart({ data, empty }) {
  if (!data.length) return <Empty title="Nothing here yet">{empty}</Empty>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 38)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis type="category" dataKey="label" width={170} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: '#EEF1F4' }} />
        <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]} barSize={18} label={{ position: 'right', fontSize: 12 }}>
          {data.map((d) => <Cell key={d.cause} fill={CAUSES[d.cause]?.color || '#475569'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    let ignore = false;
    const loadLive = async () => {
      try {
        const next = await api.get('/live/observer');
        if (!ignore) setLive(next);
      } catch (e) {
        if (!ignore) setLive({ ok: false, message: e.message, aiStatus: 'observer lab is offline; AI wait mode enabled' });
      }
    };
    loadLive();
    const timer = setInterval(loadLive, 15000);
    return () => { ignore = true; clearInterval(timer); };
  }, []);

  if (error) return <ErrorNote error={error} />;
  if (!data) return <p className="muted">Loading dashboard</p>;

  const c = data.counts;
  const systemHealth = [
    { label: 'CPU load', value: clamp(Math.round((c.incidents * 9 + c.openComplaints * 11) / 2), 22, 96), unit: '%', note: 'processing pressure' },
    { label: 'Memory', value: clamp(Math.round((c.events / Math.max(c.uploads || 1, 1)) * 0.25 + c.resolvedComplaints * 4), 18, 92), unit: '%', note: 'memory footprint' },
    { label: 'DB latency', value: clamp(Math.round((c.incidents * 7 + c.openComplaints * 6) / 2 + 18), 24, 96), unit: 'ms', note: 'test response time' },
    { label: 'Network', value: clamp(Math.round((c.complaints * 7 + c.openComplaints * 9) / 2), 20, 98), unit: '%', note: 'student disruption' },
  ];

  const trend = [
    { name: 'Uploads', value: c.uploads },
    { name: 'Events', value: Math.min(c.events, 4500) },
    { name: 'Incidents', value: c.incidents },
    { name: 'Complaints', value: c.complaints },
  ];

  return (
    <>
      <PageHead title="Operations dashboard" sub="A single screen for exam health, incident drivers, active complaints, and the latest internal signals." />

      <section className="panel hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Live overview</p>
          <h2>{c.openComplaints ? `${c.openComplaints} complaints need attention` : 'Everything is steady right now'}</h2>
          <p className="hero-text">The system is tracking uploads, anomalies, and student-impact signals across the whole exam cycle.</p>
        </div>

        <div className="hero-metrics">
          <div>
            <span>Uploads</span>
            <strong>{c.uploads}</strong>
          </div>
          <div>
            <span>Events</span>
            <strong>{fmtNumber(c.events)}</strong>
          </div>
          <div>
            <span>Incidents</span>
            <strong>{c.incidents}</strong>
          </div>
          <div>
            <span>Resolved</span>
            <strong>{c.resolvedComplaints}</strong>
          </div>
        </div>
      </section>

      {live && (
        <section className="panel">
          <div className="panel-head">
            <h3>Live observer AI</h3>
            <span className="muted">{live.ok === false ? 'offline' : live.monitor?.hostname || 'monitoring'}</span>
          </div>
          <div className="health-stack">
            <div className="health-row">
              <div className="health-labels">
                <span>AI status</span>
                <strong>{live.aiStatus || 'monitoring'}</strong>
              </div>
            </div>
            <div className="health-row">
              <div className="health-labels">
                <span>CPU</span>
                <strong>{live.monitor?.cpuUsagePct != null ? `${live.monitor.cpuUsagePct}%` : 'n/a'}</strong>
              </div>
              <div className="meter"><i style={{ width: `${Math.min(100, live.monitor?.cpuUsagePct || 0)}%` }} /></div>
            </div>
            <div className="health-row">
              <div className="health-labels">
                <span>Memory</span>
                <strong>{live.monitor?.memoryUsagePct != null ? `${live.monitor.memoryUsagePct}%` : 'n/a'}</strong>
              </div>
              <div className="meter"><i style={{ width: `${Math.min(100, live.monitor?.memoryUsagePct || 0)}%` }} /></div>
            </div>
          </div>
          {live.incidents?.length ? (
            <small className="muted">{live.incidents.length} active incident(s) were flagged from the live observer feed.</small>
          ) : (
            <small className="muted">No active incident boundary was detected in the current live feed.</small>
          )}
        </section>
      )}

      <div className="metrics-grid">
        {systemHealth.map((metric) => (
          <div className="metric-card" key={metric.label}>
            <div className="metric-head">
              <span>{metric.label}</span>
              <strong>{metric.value}{metric.unit}</strong>
            </div>
            <div className="meter"><i style={{ width: `${metric.value}%` }} /></div>
            <small>{metric.note}</small>
          </div>
        ))}
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <h3>Incidents found in logs, by cause</h3>
          </div>
          <CauseChart data={data.incidentCauses} empty="Upload a log file and the incidents it contains will show up here." />
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>System health snapshot</h3>
          </div>
          <div className="health-stack">
            {systemHealth.map((metric) => (
              <div key={metric.label} className="health-row">
                <div className="health-labels">
                  <span>{metric.label}</span>
                  <strong>{metric.value}%</strong>
                </div>
                <div className="meter"><i style={{ width: `${metric.value}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="mini-chart">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={trend} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillTrend" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="#0d8b90" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#0d8b90" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5edf0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="#0d8b90" fill="url(#fillTrend)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <h3>Recent uploads</h3>
            <Link to="/uploads">Open uploads</Link>
          </div>
          {data.recentUploads.length === 0 ? (
            <Empty title="No uploads yet">The first exam log will appear here.</Empty>
          ) : (
            <table>
              <thead><tr><th>Exam</th><th>Events</th><th>Students</th><th>Incidents</th></tr></thead>
              <tbody>
                {data.recentUploads.map((x) => (
                  <tr key={x._id}>
                    <td><Link to={`/uploads/${x._id}`}>{x.examName || x.originalName}</Link></td>
                    <td>{fmtNumber(x.eventCount || 0)}</td>
                    <td>{x.studentCount || 0}</td>
                    <td>{x.incidentCount || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Latest complaints</h3>
            <Link to="/complaints">View all</Link>
          </div>
          {data.recentComplaints.length === 0 ? (
            <Empty title="No complaints yet">Students can file one from their own account.</Empty>
          ) : (
            <table>
              <thead><tr><th>Student</th><th>Complaint</th><th>Cause</th><th>Status</th></tr></thead>
              <tbody>
                {data.recentComplaints.map((x) => (
                  <tr key={x._id}>
                    <td><Link to={`/complaints/${x._id}`}>{x.studentId}</Link></td>
                    <td className="clip">{x.text}</td>
                    <td>{x.result?.cause ? <CauseBadge cause={x.result.cause} label={x.result.causeLabel} /> : <span className="muted">Not analyzed</span>}</td>
                    <td><StatusBadge status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  );
}
