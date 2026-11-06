import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import type { StaffRow } from '../../types';
import Avatar from '../Avatar';

/** Вкладка администратора платформы: назначение и снятие модераторов. Администраторы задаются на сервере (PLATFORM_ADMIN_EMAILS). */
export default function StaffTab() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [identifier, setIdentifier] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api.platform.staff().then(setRows).catch((e) => setError(e.message)), []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <>
      <p className="muted">Администратор управляет только составом модераторов. Модератор проверяет расширения, удаляет их и блокирует авторов в части расширений. Доступа к чужим проектам эти роли не дают.</p>
      <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const v = identifier.trim(); if (v) run(async () => { await api.platform.addModerator(v); setIdentifier(''); }); }}>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="E-mail или имя пользователя" />
        <button className="btn btn-primary" type="submit">Назначить модератором</button>
      </form>
      {error && <div className="notice notice-err">{error}</div>}
      <ul className="friend-list">
        {rows.map((r) => (
          <li key={r.id} className="friend-person">
            <Avatar user={r} />
            <div className="friend-name"><b>{r.username}</b><small className="muted">{r.email}</small></div>
            <span className={r.role === 'ADMIN' ? 'badge badge-roadmap' : 'badge badge-todo'}>{r.role === 'ADMIN' ? 'Администратор' : 'Модератор'}</span>
            {r.role === 'MODERATOR' && <button className="btn btn-danger-ghost btn-sm" onClick={() => run(() => api.platform.removeModerator(r.id))}>Снять</button>}
          </li>
        ))}
      </ul>
    </>
  );
}
