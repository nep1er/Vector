import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { MyExtension, PlatformMe } from '../../types';
import { STATUS_LABEL } from '../../utils/extensions';
import UploadModal from './UploadModal';

export default function MineTab({ me, onOpen, refreshKey, onChanged }: { me: PlatformMe; onOpen: (id: number) => void; refreshKey: number; onChanged: () => void }) {
  const [items, setItems] = useState<MyExtension[]>([]);
  const [upload, setUpload] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setItems(await api.extensions.mine());
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const remove = async (e: MyExtension) => {
    if (!confirm(`Удалить расширение «${e.name}» целиком? Оно пропадёт из библиотек и проектов.`)) return;
    try {
      await api.extensions.removeOwn(e.id);
      await load();
      onChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <>
      <div className="ext-toolbar">
        <p className="muted">Разработчики загружают архив .zip — сервер его проверяет, затем модератор одобряет версию.</p>
        <button className="btn btn-primary" disabled={!!me.ban} onClick={() => setUpload(true)}>Загрузить расширение</button>
      </div>
      {me.ban && <div className="notice notice-err">Вам закрыта публикация расширений. Причина: {me.ban.reason}. Аккаунт и проекты не затронуты.</div>}
      {error && <div className="notice notice-err">{error}</div>}
      {items.length === 0 ? <p className="empty">Вы ещё ничего не публиковали.</p> : (
        <div className="ext-mine">
          {items.map((e) => (
            <section key={e.id} className="panel ext-mine-item">
              <header>
                <button className="link-btn ext-name" onClick={() => onOpen(e.id)}>{e.name}</button>
                <small className="muted">{e.slug} · в библиотеках: {e.library_count}</small>
                {e.status === 'REMOVED' && <span className="badge badge-warn">Удалено модератором: {e.removed_reason}</span>}
                <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(e)}>Удалить</button>
              </header>
              <ul className="ext-versions">
                {e.versions.map((v) => (
                  <li key={v.id}>
                    <b>{v.version}</b>
                    <span className={`badge ext-st-${v.status.toLowerCase()}`}>{STATUS_LABEL[v.status]}</span>
                    {v.review_note && <span className="muted">— {v.review_note}</span>}
                    {v.warnings.length > 0 && <span className="muted">предупреждений: {v.warnings.length}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {upload && <UploadModal onClose={() => setUpload(false)} onDone={() => { load(); onChanged(); }} />}
    </>
  );
}
