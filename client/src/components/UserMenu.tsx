import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Avatar from './Avatar';
import Icon from './Icon';
import ThemeSwitcher from './ThemeSwitcher';

/** Блок профиля внизу меню: по клику раскрывается список действий. */
export default function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <div className="user-menu" ref={ref}>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">{user.email}</div>

          <button className="menu-item" role="menuitem" onClick={() => go('/profile')}>
            <Icon name="user" />
            Настройки профиля
          </button>
          <div className="menu-theme">
            <span>
              <Icon name="theme" size={18} />
              Тема
            </span>
            <ThemeSwitcher />
          </div>
          <button className="menu-item" role="menuitem" disabled>
            <Icon name="globe" />
            Язык
            <span className="chip">Скоро</span>
          </button>
          <button className="menu-item" role="menuitem" disabled>
            <Icon name="help" />
            Помощь
            <span className="chip">Скоро</span>
          </button>

          <div className="menu-sep" />

          <button
            className="menu-item"
            role="menuitem"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <Icon name="logout" />
            Выйти
          </button>
        </div>
      )}

      <button
        className="user-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Avatar user={user} size={34} />
        <span className="user-btn-text">
          <span className="user-btn-name">{user.username}</span>
          <span className="user-btn-mail">{user.email}</span>
        </span>
      </button>
    </div>
  );
}
