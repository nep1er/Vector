import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import type { AppNotification } from '../types';

const dateFmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' });

/** Текст и ссылка уведомления по его типу и payload. */
function describe(n: AppNotification): { text: string; to?: string } {
  const p = n.payload;
  switch (n.type) {
    case 'PROJECT_INVITATION':
      return {
        text: `${p.inviter_name} приглашает вас в проект «${p.project_title}»`,
      };
    case 'CARD_COMMENT':
      return {
        text: `${p.author_name} прокомментировал карточку «${p.card_title}»`,
        to: `/projects/${p.project_id}`,
      };
    case 'TASK_STATUS_CHANGED':
      return {
        text: `${p.actor_name} изменил статус задачи «${p.task_title}» на «${p.status_name}»`,
        to: `/projects/${p.project_id}`,
      };
    case 'FRIEND_REQUEST':
      return { text: `${p.from_username} хочет добавить вас в друзья` };
    case 'FRIEND_ACCEPTED':
      return { text: `${p.username} принял вашу заявку в друзья` };
    default:
      return { text: 'Новое уведомление' };
  }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await api.notifications.list());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить уведомления');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: number, action: () => Promise<unknown>) => {
    setBusyId(id);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Операция не выполнена');
    } finally {
      setBusyId(null);
    }
  };

  const unread = items.filter((n) => !n.is_read).length;

  return (
    <>
      <div className="page-head">
        <h1>Уведомления</h1>
        <div className="page-actions">
          {unread > 0 && (
            <button className="btn btn-secondary" onClick={() => act(0, () => api.notifications.readAll())}>
              <Icon name="check" size={18} />
              Прочитать все
            </button>
          )}
        </div>
      </div>

      {error && <div className="notice notice-err">{error}</div>}

      {loading ? (
        <div className="muted">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <Icon name="bell" size={32} />
          <h2>Нет уведомлений</h2>
        </div>
      ) : (
        <ul className="notif-list">
          {items.map((n) => {
            const { text, to } = describe(n);
            const pending = n.type === 'PROJECT_INVITATION' && n.invitation_status === 'PENDING';
            const finished =
              n.type === 'PROJECT_INVITATION' && n.invitation_status && n.invitation_status !== 'PENDING';
            const busy = busyId === n.id;
            return (
              <li key={n.id} className={n.is_read ? 'notif' : 'notif unread'}>
                <div className="notif-main">
                  <p>{text}</p>
                  <span className="muted">{dateFmt.format(new Date(n.created_at))}</span>
                  {finished && (
                    <span className="muted">
                      {' · '}
                      {n.invitation_status === 'ACCEPTED'
                        ? 'Приглашение принято'
                        : n.invitation_status === 'CANCELED'
                          ? 'Приглашение отозвано'
                          : 'Приглашение отклонено'}
                    </span>
                  )}
                </div>

                <div className="notif-actions">
                  {pending && (
                    <>
                      <button
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => act(n.id, () => api.invitations.accept(n.payload.invitation_id))}
                      >
                        Принять
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => act(n.id, () => api.invitations.decline(n.payload.invitation_id))}
                      >
                        Отклонить
                      </button>
                    </>
                  )}
                  {n.type === 'FRIEND_REQUEST' && (
                    <>
                      <button
                        className="btn btn-primary"
                        disabled={busy}
                        onClick={() => act(n.id, () => api.friends.accept(n.payload.friend_id))}
                      >
                        Принять
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => act(n.id, () => api.friends.remove(n.payload.friend_id))}
                      >
                        Отклонить
                      </button>
                    </>
                  )}
                  {!pending && n.type === 'PROJECT_INVITATION' && n.invitation_status === 'ACCEPTED' && (
                    <Link className="btn btn-secondary" to={`/projects/${n.payload.project_id}`}>
                      Открыть проект
                    </Link>
                  )}
                  {to && (
                    <Link
                      className="btn btn-secondary"
                      to={to}
                      onClick={() => !n.is_read && api.notifications.markRead(n.id).catch(() => undefined)}
                    >
                      Открыть
                    </Link>
                  )}
                  {!n.is_read && (
                    <button
                      className="icon-btn"
                      title="Отметить прочитанным"
                      aria-label="Отметить прочитанным"
                      disabled={busy}
                      onClick={() => act(n.id, () => api.notifications.markRead(n.id))}
                    >
                      <Icon name="check" size={18} />
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    title="Удалить"
                    aria-label="Удалить уведомление"
                    disabled={busy}
                    onClick={() => act(n.id, () => api.notifications.remove(n.id))}
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
