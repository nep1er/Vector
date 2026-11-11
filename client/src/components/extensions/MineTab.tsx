import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { MyExtension, PlatformMe } from '../../types';
import { STATUS_LABEL } from '../../utils/extensions';
import Icon from '../Icon';
import ExtCover from './ExtCover';
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
      <div className="xp-toolbar">
        <p className="xp-hint">Загрузите архив .zip: сервер проверит его, затем модератор одобрит версию.</p>
        <button className="btn btn-primary" disabled={!!me.ban} onClick={() => setUpload(true)}>
          <Icon name="plus" size={16} /> Загрузить расширение
        </button>
      </div>
      {me.ban && <div className="notice notice-err">Вам закрыта публикация расширений. Причина: {me.ban.reason}. Аккаунт и проекты не затронуты.</div>}
      {error && <div className="notice notice-err">{error}</div>}
      {items.length === 0 ? (
        <div className="xp-empty">
          <Icon name="puzzle" size={36} />
          <h3>Вы ещё ничего не публиковали</h3>
          <p>Нажмите «Загрузить расширение», чтобы добавить первое.</p>
        </div>
      ) : (
        <ul className="xm-list">
          {items.map((e) => (
            <li key={e.id} className="xm-item">
              <ExtCover name={e.name} slug={e.slug} compact />
              <div className="xm-main">
                <button className="xm-name" onClick={() => onOpen(e.id)}>{e.name}</button>
                <small className="muted">{e.slug} · в библиотеках: {e.library_count}</small>
                {e.status === 'REMOVED' && <span className="badge badge-warn">Удалено модератором: {e.removed_reason}</span>}
                <div className="xm-versions">
                  {e.versions.map((v) => (
                    <span key={v.id} className={`xm-ver ext-st-${v.status.toLowerCase()}`} title={v.review_note ?? undefined}>
                      {v.version} · {STATUS_LABEL[v.status]}
                    </span>
                  ))}
                </div>
              </div>
              <button className="xm-del" onClick={() => remove(e)}>Удалить</button>
            </li>
          ))}
        </ul>
      )}
      {upload && <UploadModal onClose={() => setUpload(false)} onDone={() => { load(); onChanged(); }} />}
    </>
  );
}
