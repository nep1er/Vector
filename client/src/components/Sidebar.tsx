import { Link, NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon';
import Logo from './Logo';
import UserMenu from './UserMenu';

export default function Sidebar({ open }: { open: boolean }) {
  const { pathname } = useLocation();
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'side-link active' : 'side-link';

  // «Проекты» подсвечены и на главной, и внутри любого проекта
  const projectsActive = pathname === '/' || pathname.startsWith('/projects');

  return (
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <Link to="/" className="sidebar-brand" aria-label="Vector">
        <Logo height={32} />
      </Link>

      <nav className="side-nav" aria-label="Основная навигация">
        <Link to="/" className={projectsActive ? 'side-link active' : 'side-link'}>
          <Icon name="folder" />
          Проекты
        </Link>
        <NavLink to="/tasks" className={linkClass}>
          <Icon name="tasks" />
          Задачи
        </NavLink>
        <NavLink to="/notifications" className={linkClass}>
          <Icon name="bell" />
          Уведомления
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <UserMenu />
      </div>
    </aside>
  );
}
