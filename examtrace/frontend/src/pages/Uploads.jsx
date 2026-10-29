import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { fmtDateTime, fmtNumber } from '../causes';
import { Empty, ErrorNote, PageHead } from '../components/ui';

export default function Uploads() {
  const [list, setList] = useState(null);
  const [file, setFile] = useState(null);
  const [examName, setExamName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const input = useRef();
  const navigate = useNavigate();

  const load = () => api.get('/logs').then(setList).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setError('Choose a log file first');
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('examName', examName);
      const res = await api.upload('/logs', form);
      navigate(`/uploads/${res._id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this log file and its analysis? Complaints already analyzed keep their results.')) return;
    await api.del(`/logs/${id}`);
    load();
  };

  return (
    <>
      <PageHead title="Log files" sub="Upload a backend log from an exam and let the system highlight the likely student issues in plain language." />

      <form className="panel upload-form" onSubmit={submit}>
        <div className="helper-strip">
          <span className="helper-pill">Easy upload</span>
          <span>Choose a file, name the exam, and review the outcomes in a few seconds.</span>
        </div>
        <div
          className={`drop ${drag ? 'over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0]); }}
          onClick={() => input.current.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && input.current.click()}
        >
          <input ref={input} type="file" accept=".log,.txt,.json,.csv" hidden onChange={(e) => setFile(e.target.files[0])} />
          {file ? <strong>{file.name} <span className="muted">({(file.size / 1024).toFixed(0)} KB)</span></strong> : <strong>Drop a log file here or click to browse</strong>}
          <span className="muted small">.log, .txt, .json or .csv, up to 100 MB</span>
        </div>
        <label>Exam name
          <input value={examName} onChange={(e) => setExamName(e.target.value)} placeholder="Data Structures - Internal Test 2" />
        </label>
        <ErrorNote error={error} />
        <button className="btn primary" disabled={busy}>{busy ? 'Analyzing logs' : 'Upload and analyze'}</button>
      </form>

      <section className="panel">
        <h3>Uploaded files</h3>
        {!list ? <p className="muted">Loading</p> : list.length === 0 ? (
          <Empty title="No log files yet">Upload the first one above. A sample file is in backend/sample-data.</Empty>
        ) : (
          <table>
            <thead><tr><th>Exam</th><th>File</th><th>Events</th><th>Students</th><th>Incidents</th><th>Uploaded</th><th /></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u._id}>
                  <td><Link to={`/uploads/${u._id}`}>{u.examName}</Link></td>
                  <td className="muted">{u.originalName}</td>
                  <td>{fmtNumber(u.eventCount)}</td>
                  <td>{u.studentCount}</td>
                  <td>{u.incidentCount}</td>
                  <td>{fmtDateTime(u.createdAt)}</td>
                  <td><button className="link-btn danger" onClick={() => remove(u._id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
