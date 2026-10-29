import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { CATEGORIES, fmtDateTime } from '../causes';
import { CauseBadge, Empty, ErrorNote, PageHead, StatusBadge } from '../components/ui';

const blank = { studentId: '', examName: '', category: 'slow', occurredAt: '', text: '' };

export default function Complaints() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const [list, setList] = useState(null);
  const [status, setStatus] = useState('');
  const [form, setForm] = useState(blank);
  const [show, setShow] = useState(!admin);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/complaints${status ? `?status=${status}` : ''}`).then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [status]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/complaints', { ...form, occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined });
      setForm(blank);
      if (admin) setShow(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title={admin ? 'Complaints' : 'My complaints'}
        sub={admin ? 'Match each student report to the logs and find the cause.' : 'Tell us what went wrong during your exam. We check it against the system logs.'}
        actions={admin && <button className="btn" onClick={() => setShow(!show)}>{show ? 'Close form' : 'Log a complaint'}</button>}
      />

      {show && (
        <form className="panel form-grid" onSubmit={submit}>
          <h3>{admin ? 'Log a complaint for a student' : 'Report a problem'}</h3>
          {admin && <label>Student ID<input value={form.studentId} onChange={set('studentId')} placeholder="S105" required /></label>}
          <label>Exam<input value={form.examName} onChange={set('examName')} placeholder="Data Structures - Internal Test 2" /></label>
          <label>What happened
            <select value={form.category} onChange={set('category')}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          <label>When did it happen
            <input type="datetime-local" value={form.occurredAt} onChange={set('occurredAt')} />
          </label>
          <label className="wide">Describe the problem
            <textarea rows={3} value={form.text} onChange={set('text')} placeholder="The question page froze for about two minutes and then reloaded." required />
          </label>
          <ErrorNote error={error} />
          <button className="btn primary" disabled={busy}>{busy ? 'Sending' : 'Submit complaint'}</button>
        </form>
      )}

      <section className="panel">
        <div className="panel-head">
          <h3>{admin ? 'All complaints' : 'Your complaints'}</h3>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
            <option value="">All statuses</option><option value="open">Open</option><option value="analyzed">Analyzed</option><option value="resolved">Resolved</option>
          </select>
        </div>
        {!list ? <p className="muted">Loading</p> : list.length === 0 ? (
          <Empty title="No complaints">{admin ? 'Complaints filed by students will appear here.' : 'You have not reported any problems.'}</Empty>
        ) : (
          <table>
            <thead><tr>{admin && <th>Student</th>}<th>Complaint</th><th>Happened</th>{admin && <th>Cause</th>}<th>Status</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c._id}>
                  {admin && <td>{c.studentId}<div className="muted small">{c.studentName}</div></td>}
                  <td className="clip"><Link to={`/complaints/${c._id}`}>{c.text}</Link></td>
                  <td>{fmtDateTime(c.occurredAt || c.createdAt)}</td>
                  {admin && <td>{c.result?.cause ? <CauseBadge cause={c.result.cause} label={c.result.causeLabel} /> : <span className="muted">Not analyzed</span>}</td>}
                  <td><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
