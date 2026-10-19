import { NavLink } from 'react-router-dom';
import { LogoMark } from './Avatar';
import Icon from './Icon';
import UserMenu from './UserMenu';

export default function Sidebar({ open }: { open: boolean }) {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'side-link active' : 'side-link';

  return (
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <div className="sidebar-brand">
        <LogoMark size={30} />
        <span>Vector</span>
      </div>

      <nav className="side-nav" aria-label="Основная навигация">
        <NavLink to="/" end className={linkClass}>
          <Icon name="folder" />
          Проекты
        </NavLink>
        <NavLink to="/tasks" className={linkClass}>
          <Icon name="tasks" />
          Задачи
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <UserMenu />
      </div>
    </aside>
  );
}
