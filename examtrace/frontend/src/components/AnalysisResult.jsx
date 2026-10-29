import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { CAUSES, fmtTime } from '../causes';
import { CauseBadge } from './ui';

/** Shows one student's analysis: verdict, explanation, timeline, factors, evidence and fixes. */
export default function AnalysisResult({ result, admin = true }) {
  if (!result) return null;
  const meta = CAUSES[result.cause] || {};
  const pct = Math.round((result.confidence || 0) * 100);

  return (
    <section className="result" style={{ '--c': meta.color || '#0E7C86' }}>
      <div className="verdict">
        <div>
          <CauseBadge cause={result.cause} label={result.causeLabel} />
          <h2>{result.verdict === 'not_supported' ? 'The logs do not support this complaint' : result.causeLabel}</h2>
        </div>
        {result.verdict !== 'no_data' && admin && (
          <div className="confidence" title="Confidence of the top cause">
            <span>{pct}%</span>
            <div className="meter"><i style={{ width: `${pct}%` }} /></div>
            <small>confidence</small>
          </div>
        )}
      </div>

      <p className="explanation">{result.explanation}</p>

      {admin && result.stats?.requests > 0 && (
        <dl className="facts compact">
          <div><dt>Requests</dt><dd>{result.stats.requests}</dd></div>
          <div><dt>Slow or failed</dt><dd>{result.stats.problemRequests}</dd></div>
          <div><dt>Avg latency</dt><dd>{result.stats.avgLatency} ms</dd></div>
          <div><dt>Platform median</dt><dd>{result.serverMedianLatency} ms</dd></div>
        </dl>
      )}

      {admin && result.timeline?.length > 1 && (
        <div className="panel">
          <h3>Student latency compared with the platform</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={result.timeline.map((t) => ({ ...t, time: fmtTime(t.ts) }))} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="#E3E7EB" vertical={false} />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis yAxisId="ms" tick={{ fontSize: 11 }} unit=" ms" width={62} />
              <YAxis yAxisId="cpu" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" width={40} />
              <Tooltip />
              <Legend />
              <Line yAxisId="ms" type="monotone" dataKey="studentLatency" name="This student" stroke="#0E7C86" strokeWidth={2.4} dot={false} connectNulls />
              <Line yAxisId="ms" type="monotone" dataKey="serverLatency" name="All students" stroke="#94A3B8" strokeWidth={1.6} dot={false} />
              <Line yAxisId="cpu" type="monotone" dataKey="cpu" name="Server CPU" stroke="#C2410C" strokeDasharray="4 3" strokeWidth={1.4} dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {admin && result.factors?.length > 0 && (
        <div className="panel">
          <h3>Why this cause was chosen</h3>
          <ul className="factors">
            {result.factors.map((f) => (
              <li key={f.label}>
                <span>{f.label}</span>
                <span className="bar"><i style={{ width: `${Math.min(100, f.weight * 100)}%` }} /></span>
              </li>
            ))}
          </ul>
          {result.ranking?.length > 1 && (
            <p className="muted small">
              Other causes considered: {result.ranking.slice(1).map((r) => `${r.label} (${Math.round(r.share * 100)}%)`).join(', ')}
            </p>
          )}
        </div>
      )}

      {admin && result.evidence?.length > 0 && (
        <div className="panel">
          <h3>Evidence from the logs</h3>
          <pre className="evidence">{result.evidence.join('\n')}</pre>
        </div>
      )}

      {admin && result.recommendations?.length > 0 && (
        <div className="panel">
          <h3>Recommended actions</h3>
          <ul className="plain">{result.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      )}
    </section>
  );
}
