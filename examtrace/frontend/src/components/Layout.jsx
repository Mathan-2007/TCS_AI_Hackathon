import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = user.role === 'admin'
    ? [['/', 'Overview'], ['/uploads', 'Upload logs'], ['/complaints', 'Complaints']]
    : [['/complaints', 'My complaints']];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-wrap">
          <div className="brand-mark">ET</div>
          <div>
            <div className="brand">ExamTrace</div>
            <div className="brand-sub">Student support</div>
          </div>
        </div>

        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="who">
          <div className="user-chip">{user.role === 'admin' ? 'Admin' : 'Student'}</div>
          <strong>{user.name}</strong>
          <span>{user.role === 'admin' ? 'Administrator access' : `Student ID ${user.studentId || ''}`}</span>
          <button className="link-btn" onClick={() => { logout(); navigate('/login'); }}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
