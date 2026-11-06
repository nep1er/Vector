import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { CatalogExtension } from '../../types';
import Icon from '../Icon';

interface Props {
  onOpen: (id: number) => void;
  refreshKey: number;
  onChanged: () => void;
}

export default function CatalogTab({ onOpen, refreshKey, onChanged }: Props) {
  const [items, setItems] = useState<CatalogExtension[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setItems(await api.extensions.catalog(q));
      setError('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const toggle = async (e: CatalogExtension) => {
    try {
      if (e.in_library) await api.extensions.removeFromLibrary(e.id);
      else await api.extensions.addToLibrary(e.id);
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <>
      <input className="panel-search" type="search" placeholder="Поиск по названию, описанию, id…" value={q} onChange={(e) => setQ(e.target.value)} />
      {error && <div className="notice notice-err">{error}</div>}
      {loading ? <p className="muted">Загрузка…</p> : items.length === 0 ? (
        <p className="empty">{q ? 'Ничего не найдено' : 'В каталоге пока нет расширений. Станьте первым автором — вкладка «Мои разработки».'}</p>
      ) : (
        <div className="ext-grid">
          {items.map((e) => (
            <article key={e.id} className="ext-card">
              <header>
                <span className="ext-ico"><Icon name="puzzle" size={22} /></span>
                <div>
                  <button className="link-btn ext-name" onClick={() => onOpen(e.id)}>{e.name}</button>
                  <small className="muted">v{e.version} · {e.author_name}</small>
                </div>
              </header>
              <p>{e.summary}</p>
              <footer>
                <small className="muted">{e.library_count} в библиотеках · прав: {e.manifest.permissions.length}</small>
                <button className={e.in_library ? 'btn btn-quiet' : 'btn btn-primary'} onClick={() => toggle(e)}>
                  {e.in_library ? 'В библиотеке ✓' : 'Добавить'}
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
