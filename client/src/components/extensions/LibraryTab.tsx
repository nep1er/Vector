import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { LibraryExtension } from '../../types';
import { UNUSABLE_LABEL } from '../../utils/extensions';
import Icon from '../Icon';
import { ExtTile } from './CatalogTab';

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
      {items.length === 0 ? (
        <div className="xp-empty">
          <Icon name="puzzle" size={36} />
          <h3>Библиотека пуста</h3>
          <p>Добавьте расширения во вкладке «Каталог» — потом их можно подключать в проектах.</p>
        </div>
      ) : (
        <>
          <p className="xp-hint">Подключайте расширения из библиотеки в проектах, где вы администратор: Настройки проекта → Расширения.</p>
          <div className="ext-tiles">
            {items.map((e) => (
              <ExtTile
                key={e.id}
                e={e}
                onOpen={onOpen}
                extra={{ badge: e.unusable ? UNUSABLE_LABEL[e.unusable] : undefined, inLibrary: true }}
                onToggle={async () => {
                  await api.extensions.removeFromLibrary(e.id).catch(() => {});
                  await load();
                  onChanged();
                }}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
