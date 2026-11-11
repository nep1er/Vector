import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { CatalogExtension } from '../../types';
import Icon from '../Icon';
import ExtCover from './ExtCover';

interface Props {
  q: string;
  onOpen: (id: number) => void;
  refreshKey: number;
  onChanged: () => void;
}

const installs = (n: number) => {
  const m = n % 10;
  const w = n % 100 >= 11 && n % 100 <= 14 ? 'установок' : m === 1 ? 'установка' : m >= 2 && m <= 4 ? 'установки' : 'установок';
  return `${n} ${w}`;
};

/** Плитка расширения: обложка, название, автор, число установок. Клик по плитке открывает страницу расширения. */
export function ExtTile({ e, onOpen, onToggle, extra }: { e: { id: number; name: string; slug: string; author_name: string; summary: string }; onOpen: (id: number) => void; onToggle?: () => void; extra?: { count?: number; inLibrary?: boolean; badge?: string } }) {
  return (
    <article className="ext-tile">
      <button className="ext-tile-main" onClick={() => onOpen(e.id)} aria-label={`Открыть: ${e.name}`}>
        <ExtCover name={e.name} slug={e.slug} />
        <div className="ext-tile-info">
          <h3>{e.name}</h3>
          <p className="ext-tile-sub">{e.author_name}{extra?.count !== undefined ? ` · ${installs(extra.count)}` : ''}</p>
          <p className="ext-tile-text">{e.summary}</p>
        </div>
      </button>
      {extra?.badge && <span className="ext-tile-badge">{extra.badge}</span>}
      {onToggle && (
        <button className={`ext-tile-add${extra?.inLibrary ? ' on' : ''}`} onClick={onToggle} title={extra?.inLibrary ? 'Убрать из библиотеки' : 'Добавить в библиотеку'}>
          {extra?.inLibrary ? <><Icon name="check" size={14} /><span className="lbl">В библиотеке</span></> : <><Icon name="plus" size={14} /><span className="lbl">Добавить</span></>}
        </button>
      )}
    </article>
  );
}

export default function CatalogTab({ q, onOpen, refreshKey, onChanged }: Props) {
  const [items, setItems] = useState<CatalogExtension[]>([]);
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
      {error && <div className="notice notice-err">{error}</div>}
      {loading ? (
        <p className="muted">Загрузка…</p>
      ) : items.length === 0 ? (
        <div className="xp-empty">
          <Icon name="puzzle" size={36} />
          <h3>{q ? 'Ничего не найдено' : 'В каталоге пока пусто'}</h3>
          <p>{q ? 'Попробуйте другое слово.' : 'Станьте первым автором — вкладка «Мои разработки».'}</p>
        </div>
      ) : (
        <div className="ext-tiles">
          {items.map((e) => (
            <ExtTile key={e.id} e={e} onOpen={onOpen} onToggle={() => toggle(e)} extra={{ count: e.library_count, inLibrary: e.in_library }} />
          ))}
        </div>
      )}
    </>
  );
}
