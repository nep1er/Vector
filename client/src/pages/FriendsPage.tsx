import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Avatar from '../components/Avatar';
import type { FriendRow } from '../types';

/** Вкладка «Друзья»: добавление по email/имени, входящие и исходящие заявки, список друзей. */
export default function FriendsPage() {
  const [rows, setRows] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await api.friends.list());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await fn();
      if (ok) setInfo(ok);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = (e: FormEvent) => {
    e.preventDefault();
    const v = identifier.trim();
    if (!v) return;
    run(async () => {
      await api.friends.sendRequest(v);
      setIdentifier('');
    }, 'Заявка отправлена');
  };

  const match = (r: FriendRow) => !q.trim() || `${r.username} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase());
  const incoming = rows.filter((r) => r.status === 'PENDING' && r.direction === 'INCOMING');
  const outgoing = rows.filter((r) => r.status === 'PENDING' && r.direction === 'OUTGOING');
  const friends = rows.filter((r) => r.status === 'ACCEPTED' && match(r));

  const person = (r: FriendRow) => (
    <div className="friend-person">
      <Avatar user={{ username: r.username, avatar_url: r.avatar_url }} size={44} />
      <div>
        <div className="friend-name">{r.username}</div>
        <div className="muted">{r.email}</div>
      </div>
    </div>
  );

  return (
    <div className="wide-page">
      <div className="page-head">
        <h1>Друзья</h1>
      </div>

      <form className="friend-add" onSubmit={send}>
        <input
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Email или имя пользователя"
          aria-label="Email или имя пользователя"
        />
        <button className="btn btn-primary" disabled={busy || !identifier.trim()}>
          Добавить в друзья
        </button>
      </form>
      {error && <div className="notice notice-err">{error}</div>}
      {info && <div className="notice">{info}</div>}

      {loading ? (
        <p className="muted">Загрузка…</p>
      ) : (
        <div className="friends-grid">
          <section className="panel">
            <div className="panel-head">
              <h2>Мои друзья {friends.length ? `(${friends.length})` : ''}</h2>
              <input className="panel-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" aria-label="Поиск друзей" />
            </div>
            {friends.length === 0 ? (
              <p className="muted">{q ? 'Никого не нашлось.' : 'Пока никого. Добавьте друга по email или имени.'}</p>
            ) : (
              <ul className="friend-list">
                {friends.map((r) => (
                  <li key={r.id}>
                    {person(r)}
                    <button
                      className="btn btn-danger-ghost"
                      disabled={busy}
                      onClick={() => window.confirm(`Удалить ${r.username} из друзей?`) && run(() => api.friends.remove(r.id))}
                    >
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="friends-side">
            <section className="panel">
              <h2>Входящие заявки {incoming.length ? `(${incoming.length})` : ''}</h2>
              {incoming.length === 0 ? (
                <p className="muted">Новых заявок нет.</p>
              ) : (
                <ul className="friend-list">
                  {incoming.map((r) => (
                    <li key={r.id}>
                      {person(r)}
                      <span className="friend-actions">
                        <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.friends.accept(r.id), 'Заявка принята')}>
                          Принять
                        </button>
                        <button className="btn btn-quiet" disabled={busy} onClick={() => run(() => api.friends.remove(r.id))}>
                          Отклонить
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="panel">
              <h2>Отправленные {outgoing.length ? `(${outgoing.length})` : ''}</h2>
              {outgoing.length === 0 ? (
                <p className="muted">Нет ожидающих ответа.</p>
              ) : (
                <ul className="friend-list">
                  {outgoing.map((r) => (
                    <li key={r.id}>
                      {person(r)}
                      <button className="btn btn-quiet" disabled={busy} onClick={() => run(() => api.friends.remove(r.id))}>
                        Отменить
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
