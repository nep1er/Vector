import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import CatalogTab from '../components/extensions/CatalogTab';
import ExtensionDetailsModal from '../components/extensions/ExtensionDetailsModal';
import LibraryTab from '../components/extensions/LibraryTab';
import MineTab from '../components/extensions/MineTab';
import ModerationTab from '../components/extensions/ModerationTab';
import StaffTab from '../components/extensions/StaffTab';
import type { PlatformMe } from '../types';

type Tab = 'catalog' | 'library' | 'mine' | 'moderation' | 'staff';

/** Раздел «Расширения»: каталог, личная библиотека, мои разработки, модерация (модераторам) и модераторы (администратору). */
export default function ExtensionsPage() {
  const { user } = useAuth();
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [tab, setTab] = useState<Tab>('catalog');
  const [open, setOpen] = useState<number | null>(null);
  const [rk, setRk] = useState(0);
  const bump = () => setRk((x) => x + 1);

  useEffect(() => {
    api.extensions.platformMe().then(setMe).catch(() => setMe({ role: null, ban: null, permissions: [] }));
  }, []);
  if (!me || !user) return <div className="splash">Загрузка…</div>;

  const tabs: [Tab, string][] = [['catalog', 'Каталог'], ['library', 'Моя библиотека'], ['mine', 'Мои разработки']];
  if (me.role) tabs.push(['moderation', 'Модерация']);
  if (me.role === 'ADMIN') tabs.push(['staff', 'Модераторы']);

  return (
    <div className="wide-page">
      <div className="page-head">
        <h1>Расширения</h1>
      </div>
      <div className="seg" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      <div className="panel ext-panel">
        {tab === 'catalog' && <CatalogTab onOpen={setOpen} refreshKey={rk} onChanged={bump} />}
        {tab === 'library' && <LibraryTab onOpen={setOpen} refreshKey={rk} onChanged={bump} />}
        {tab === 'mine' && <MineTab me={me} onOpen={setOpen} refreshKey={rk} onChanged={bump} />}
        {tab === 'moderation' && me.role && <ModerationTab onOpen={setOpen} />}
        {tab === 'staff' && me.role === 'ADMIN' && <StaffTab />}
      </div>
      {open !== null && <ExtensionDetailsModal extensionId={open} me={{ id: user.id, role: me.role }} onClose={() => setOpen(null)} onChanged={bump} />}
    </div>
  );
}
