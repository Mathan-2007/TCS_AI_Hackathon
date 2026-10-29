import { CAUSES } from '../causes';

export function CauseBadge({ cause, label }) {
  const meta = CAUSES[cause] || { label: label || cause, color: '#475569' };
  return (
    <span className="badge" style={{ '--c': meta.color }}>
      {label || meta.label}
    </span>
  );
}

export function StatusBadge({ status }) {
  const text = { open: 'Open', analyzed: 'Analyzed', resolved: 'Resolved' }[status] || status;
  return <span className={`status status-${status}`}>{text}</span>;
}

export function Facts({ items }) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

export function PageHead({ title, sub, actions }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function ErrorNote({ error }) {
  return error ? <div className="error-note" role="alert">{error}</div> : null;
}

export const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};
