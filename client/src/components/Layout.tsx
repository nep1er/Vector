import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Avatar, { LogoMark } from './Avatar';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <LogoMark />
            <span>Vector</span>
          </div>

          <nav className="tabs" aria-label="Основная навигация">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              Проекты
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              Профиль
            </NavLink>
          </nav>

          <div className="topbar-user">
            <NavLink to="/profile" className="user-chip" title="Настройки профиля">
              <Avatar user={user} size={32} />
              <span className="user-name">{user.username}</span>
            </NavLink>
            <button className="btn btn-ghost-light" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
