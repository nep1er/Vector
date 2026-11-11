import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import CatalogTab from '../components/extensions/CatalogTab';
import LibraryTab from '../components/extensions/LibraryTab';
import MineTab from '../components/extensions/MineTab';
import ModerationTab from '../components/extensions/ModerationTab';
import StaffTab from '../components/extensions/StaffTab';
import Icon from '../components/Icon';
import type { PlatformMe } from '../types';

type Tab = 'catalog' | 'library' | 'mine' | 'moderation' | 'staff';

/** Раздел «Расширения»: каталог-витрина, личная библиотека, мои разработки, модерация и модераторы (по ролям). */
export default function ExtensionsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [me, setMe] = useState<PlatformMe | null>(null);
  const [q, setQ] = useState('');
  const [rk, setRk] = useState(0);
  const bump = () => setRk((x) => x + 1);
  const open = (id: number) => navigate(`/extensions/${id}`);

  useEffect(() => {
    api.extensions.platformMe().then(setMe).catch(() => setMe({ role: null, ban: null, permissions: [] }));
  }, []);
  if (!me || !user) return <div className="splash">Загрузка…</div>;

  const tabs: [Tab, string][] = [['catalog', 'Каталог'], ['library', 'Моя библиотека'], ['mine', 'Мои разработки']];
  if (me.role) tabs.push(['moderation', 'Модерация']);
  if (me.role === 'ADMIN') tabs.push(['staff', 'Модераторы']);
  const wanted = params.get('tab') as Tab | null;
  const tab: Tab = wanted && tabs.some(([id]) => id === wanted) ? wanted : 'catalog';
  const setTab = (t: Tab) => setParams(t === 'catalog' ? {} : { tab: t }, { replace: true } as any);

  return (
    <div className="wide-page xp">
      <header className="xp-hero">
        <div>
          <h1>Расширения</h1>
          <p>Добавляйте возможности в свои проекты — или создайте своё расширение.</p>
        </div>
        {tab === 'catalog' && (
          <label className="xp-search">
            <Icon name="filter" size={18} />
            <input type="search" placeholder="Найти расширение" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
      </header>

      <div className="xp-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="xp-body">
        {tab === 'catalog' && <CatalogTab q={q} onOpen={open} refreshKey={rk} onChanged={bump} />}
        {tab === 'library' && <LibraryTab onOpen={open} refreshKey={rk} onChanged={bump} />}
        {tab === 'mine' && <MineTab me={me} onOpen={open} refreshKey={rk} onChanged={bump} />}
        {tab === 'moderation' && me.role && <ModerationTab onOpen={open} />}
        {tab === 'staff' && me.role === 'ADMIN' && <StaffTab />}
      </div>
    </div>
  );
}
