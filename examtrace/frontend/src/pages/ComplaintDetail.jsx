import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { CATEGORIES, fmtDateTime } from '../causes';
import AnalysisResult from '../components/AnalysisResult';
import { ErrorNote, Facts, PageHead, StatusBadge, downloadBlob } from '../components/ui';

export default function ComplaintDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [c, setC] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [uploadId, setUploadId] = useState('');
  const [minutes, setMinutes] = useState(5);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/complaints/${id}`).then((d) => { setC(d); setNote(d.adminNote || ''); setUploadId(d.upload || ''); }).catch((e) => setError(e.message));
    if (admin) api.get('/logs').then((l) => { setUploads(l); setUploadId((cur) => cur || l[0]?._id || ''); }).catch(() => {});
  }, [id, admin]);

  const analyze = async () => {
    setBusy(true);
    setError('');
    try { setC(await api.post(`/complaints/${id}/analyze`, { uploadId, windowMinutes: minutes })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  const update = async (patch) => {
    try { setC(await api.patch(`/complaints/${id}`, patch)); } catch (e) { setError(e.message); }
  };

  const report = async () => {
    try { downloadBlob(await api.blob(`/complaints/${id}/report`), `complaint-${c.studentId}.pdf`); } catch (e) { setError(e.message); }
  };

  if (error && !c) return <ErrorNote error={error} />;
  if (!c) return <p className="muted">Loading complaint</p>;
  const cat = CATEGORIES.find(([v]) => v === c.category)?.[1];

  return (
    <>
      <p className="crumb"><Link to="/complaints">Complaints</Link></p>
      <PageHead
        title={`${c.studentId}${c.studentName ? ` · ${c.studentName}` : ''}`}
        sub={c.examName}
        actions={<StatusBadge status={c.status} />}
      />

      <section className="panel">
        <Facts items={[['Type', cat], ['Happened', fmtDateTime(c.occurredAt)], ['Filed', fmtDateTime(c.createdAt)]]} />
        <p className="quote">{c.text}</p>
      </section>

      {admin && (
        <section className="panel">
          <h3>Find the cause</h3>
          {uploads.length === 0 ? (
            <p className="muted">Upload a log file first, then come back to analyze this complaint.</p>
          ) : (
            <div className="inline-form">
              <select value={uploadId} onChange={(e) => setUploadId(e.target.value)} aria-label="Log file">
                {uploads.map((u) => <option key={u._id} value={u._id}>{u.examName} ({u.originalName})</option>)}
              </select>
              <label className="mini">Window
                <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                  {[3, 5, 10, 15, 30].map((m) => <option key={m} value={m}>±{m} min</option>)}
                </select>
              </label>
              <button className="btn primary" onClick={analyze} disabled={busy || !uploadId}>{busy ? 'Analyzing' : c.result ? 'Analyze again' : 'Analyze with logs'}</button>
            </div>
          )}
          {!c.occurredAt && <p className="muted small">No time was given, so the whole log is searched for this student.</p>}
        </section>
      )}
      <ErrorNote error={error} />

      {c.result ? (
        <>
          <AnalysisResult result={c.result} admin={admin} />
          {admin && (
            <section className="panel">
              <h3>Close the loop</h3>
              <label>Note for the record
                <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="actions">
                <button className="btn" onClick={() => update({ adminNote: note })}>Save note</button>
                <button className="btn" onClick={report}>Download PDF report</button>
                {c.status !== 'resolved'
                  ? <button className="btn primary" onClick={() => update({ status: 'resolved', adminNote: note })}>Mark resolved</button>
                  : <button className="btn" onClick={() => update({ status: 'analyzed' })}>Reopen</button>}
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="panel"><p className="muted">{admin ? 'This complaint has not been checked against the logs yet.' : 'Your complaint has been received. You will see the result here once the exam cell has checked the system logs.'}</p></section>
      )}
    </>
  );
}
