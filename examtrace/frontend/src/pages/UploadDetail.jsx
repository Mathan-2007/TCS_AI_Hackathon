import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { api } from '../api';
import { fmtDateTime, fmtNumber, fmtTime } from '../causes';
import AnalysisResult from '../components/AnalysisResult';
import { CauseBadge, ErrorNote, Facts, PageHead } from '../components/ui';

function Incident({ inc }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="incident" style={{ '--c': 'var(--accent)' }}>
      <button className="incident-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="when">{fmtTime(inc.start)}-{fmtTime(inc.end)}</span>
        <CauseBadge cause={inc.cause} label={inc.causeLabel} />
        <span className="muted">{Math.round(inc.confidence * 100)}% confidence · {inc.affectedStudents} students affected · peak {fmtNumber(inc.peakLatency)} ms</span>
        <span className="chev">{open ? 'Hide' : 'Details'}</span>
      </button>
      {open && (
        <div className="incident-body">
          <p className="explanation">{inc.explanation}</p>
          {inc.evidence.length > 0 && <pre className="evidence">{inc.evidence.join('\n')}</pre>}
          <h4>Recommended actions</h4>
          <ul className="plain">{inc.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </article>
  );
}

export default function UploadDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [sid, setSid] = useState('');
  const [student, setStudent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState(null);
  const [filter, setFilter] = useState({ student: '', level: '', q: '' });

  useEffect(() => { api.get(`/logs/${id}`).then(setDoc).catch((e) => setError(e.message)); }, [id]);

  const chart = useMemo(
    () => (doc?.summary?.windows || []).map((w) => ({ ...w, time: fmtTime(w.ts), k: new Date(w.ts).getTime() })),
    [doc]
  );

  const analyze = async (studentId) => {
    if (!studentId.trim()) return;
    setBusy(true);
    setError('');
    setSid(studentId);
    try { setStudent(await api.get(`/logs/${id}/student/${encodeURIComponent(studentId.trim())}`)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const searchLogs = async (e) => {
    e?.preventDefault();
    const p = new URLSearchParams({ limit: '100' });
    Object.entries(filter).forEach(([k, v]) => v && p.set(k, v));
    try { setLogs(await api.get(`/logs/${id}/events?${p}`)); } catch (err) { setError(err.message); }
  };

  if (error && !doc) return <ErrorNote error={error} />;
  if (!doc) return <p className="muted">Loading analysis</p>;
  const s = doc.summary;

  return (
    <>
      <PageHead title={doc.examName} sub={`${doc.originalName} · uploaded ${fmtDateTime(doc.createdAt)}`} />

      <div className="stat-row">
        <div><strong>{fmtNumber(s.stats.events)}</strong><span>events</span></div>
        <div><strong>{s.stats.students}</strong><span>students</span></div>
        <div><strong>{s.stats.medianLatency} ms</strong><span>median latency</span></div>
        <div><strong>{(s.stats.errorRate * 100).toFixed(1)}%</strong><span>request failures</span></div>
        <div className={s.incidents.length ? 'attn' : ''}><strong>{s.incidents.length}</strong><span>incidents</span></div>
      </div>

      <section className="panel">
        <h3>Response time and server load during the exam</h3>
        <p className="muted small">Shaded bands are detected incidents. Times are UTC.</p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chart} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#E3E7EB" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={30} />
            <YAxis yAxisId="ms" tick={{ fontSize: 11 }} unit=" ms" width={64} />
            <YAxis yAxisId="cpu" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={40} />
            <Tooltip />
            <Legend />
            {s.incidents.map((i) => (
              <ReferenceArea key={i.id} yAxisId="ms" x1={fmtTime(i.start)} x2={fmtTime(new Date(new Date(i.end) - 60000))} fill="#C2410C" fillOpacity={0.12} />
            ))}
            <Area yAxisId="ms" type="monotone" dataKey="avgLatency" name="Avg latency" stroke="#0E7C86" fill="#0E7C86" fillOpacity={0.14} strokeWidth={2} />
            <Line yAxisId="cpu" type="monotone" dataKey="cpuMax" name="CPU" stroke="#C2410C" strokeWidth={1.4} dot={false} connectNulls />
            <Line yAxisId="cpu" type="monotone" dataKey="memMax" name="Memory" stroke="#7C3AED" strokeWidth={1.4} dot={false} connectNulls strokeDasharray="4 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </section>

      <section className="panel">
        <h3>Incidents detected</h3>
        {s.incidents.length === 0 ? <p className="muted">No abnormal periods were found in this log.</p> : s.incidents.map((i) => <Incident key={i.id} inc={i} />)}
      </section>

      <section className="panel">
        <h3>Check one student</h3>
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); analyze(sid); }}>
          <input value={sid} onChange={(e) => setSid(e.target.value)} placeholder="Student ID, for example S105" aria-label="Student ID" />
          <button className="btn primary" disabled={busy}>{busy ? 'Analyzing' : 'Analyze student'}</button>
        </form>
        {s.topAffected.length > 0 && (
          <p className="chips">
            <span className="muted small">Most affected:</span>
            {s.topAffected.slice(0, 8).map((t) => (
              <button key={t.studentId} className="chip" onClick={() => analyze(t.studentId)}>{t.studentId} <small>{t.problemRequests}</small></button>
            ))}
          </p>
        )}
        <ErrorNote error={error} />
        {student && <AnalysisResult result={student} />}
      </section>

      <section className="panel">
        <h3>Search raw logs</h3>
        <form className="inline-form" onSubmit={searchLogs}>
          <input value={filter.student} onChange={(e) => setFilter({ ...filter, student: e.target.value })} placeholder="Student ID" aria-label="Student ID filter" />
          <select value={filter.level} onChange={(e) => setFilter({ ...filter, level: e.target.value })} aria-label="Level">
            <option value="">Any level</option><option>ERROR</option><option>WARN</option><option>INFO</option>
          </select>
          <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Text contains" aria-label="Text filter" />
          <button className="btn">Search</button>
        </form>
        {logs && (
          <>
            <p className="muted small">Showing {logs.items.length} of {fmtNumber(logs.total)} matching events</p>
            <pre className="evidence tall">{logs.items.map((l) => l.raw).join('\n') || 'No events match.'}</pre>
          </>
        )}
      </section>
      <Facts items={[['Parsed lines skipped', doc.skippedLines], ['Log window', `${fmtDateTime(doc.timeRange?.start)} to ${fmtDateTime(doc.timeRange?.end)}`]]} />
    </>
  );
}
