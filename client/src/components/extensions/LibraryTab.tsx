import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { LibraryExtension } from '../../types';
import { UNUSABLE_LABEL } from '../../utils/extensions';
import Icon from '../Icon';

export default function LibraryTab({ onOpen, refreshKey, onChanged }: { onOpen: (id: number) => void; refreshKey: number; onChanged: () => void }) {
  const [items, setItems] = useState<LibraryExtension[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      setItems(await api.extensions.library());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) return <p className="muted">Загрузка…</p>;
  return (
    <>
      {error && <div className="notice notice-err">{error}</div>}
      <p className="muted">Расширения из вашей библиотеки можно подключать в проектах, где вы администратор: Настройки проекта → «Расширения».</p>
      {items.length === 0 ? <p className="empty">Библиотека пуста. Добавьте расширения во вкладке «Каталог».</p> : (
        <div className="ext-grid">
          {items.map((e) => (
            <article key={e.id} className="ext-card">
              <header>
                <span className="ext-ico"><Icon name="puzzle" size={22} /></span>
                <div>
                  <button className="link-btn ext-name" onClick={() => onOpen(e.id)}>{e.name}</button>
                  <small className="muted">{e.version ? `v${e.version} · ` : ''}{e.author_name}</small>
                </div>
              </header>
              <p>{e.summary}</p>
              <footer>
                {e.unusable ? <span className="badge badge-warn">{UNUSABLE_LABEL[e.unusable]}</span> : <span />}
                <button className="btn btn-quiet" onClick={async () => { await api.extensions.removeFromLibrary(e.id).catch(() => {}); await load(); onChanged(); }}>Убрать</button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
