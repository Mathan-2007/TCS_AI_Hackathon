import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ErrorNote } from '../components/ui';

const SAMPLE = [
  '10:05:41 WARN  db  query_ms=3480 pool=49/50',
  '10:05:44 ERROR db  lock wait timeout on answers',
  '10:05:52 WARN  web student=S140 latency_ms=3120',
  '10:06:03 ERROR web student=S140 status=504 timeout',
];

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', studentId: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand">ExamTrace</div>
        <h1>"It was slow for me" gets an answer from the logs.</h1>
        <p>Upload the backend logs after an exam. ExamTrace finds what went wrong, which students were affected and why.</p>
        <pre className="evidence on-dark" aria-hidden="true">{SAMPLE.join('\n')}</pre>
        <p className="verdict-line">Cause: database bottleneck · 97% confidence</p>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <h2>{mode === 'login' ? 'Sign in' : 'Create student account'}</h2>
          {mode === 'register' && (
            <>
              <label>Full name<input value={form.name} onChange={set('name')} required /></label>
              <label>Student ID (as it appears in the logs)<input value={form.studentId} onChange={set('studentId')} placeholder="S105" required /></label>
            </>
          )}
          <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
          <label>Password<input type="password" value={form.password} onChange={set('password')} minLength={6} required /></label>
          <ErrorNote error={error} />
          <button className="btn primary" disabled={busy}>{busy ? 'Please wait' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          <p className="switch">
            {mode === 'login' ? 'Student without an account?' : 'Already have an account?'}{' '}
            <button type="button" className="link-btn" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
          <p className="hint">Demo admin after seeding: admin@exam.local / Admin@123</p>
        </form>
      </section>
    </div>
  );
}
