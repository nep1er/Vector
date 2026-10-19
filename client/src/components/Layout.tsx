import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LogoMark } from './Avatar';
import Icon from './Icon';
import Sidebar from './Sidebar';

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // На телефоне после перехода по ссылке закрываем выезжающее меню
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="shell">
      <header className="mobile-bar">
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Открыть меню">
          <Icon name="menu" />
        </button>
        <LogoMark size={24} />
        <span>Vector</span>
      </header>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <Sidebar open={open} />

      <main className="main">
        <div className="main-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
