import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import Modal from '../components/Modal';
import type { AppNotification, NotificationCategory, NotificationSetting } from '../types';

const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

const CATEGORY: Record<NotificationCategory, { label: string; hint: string }> = {
  INVITES: { label: 'Приглашения', hint: 'Заявки в друзья и приглашения в проекты' },
  ROADMAP: { label: 'Изменения на доске', hint: 'Смена статусов этапов RoadMap' },
  TODO: { label: 'Изменения в ToDo', hint: 'Смена статусов ToDo-задач' },
  CARD: { label: 'Мои карточки', hint: 'События в карточках, где вы исполнитель' },
};

/** Текст и ссылка уведомления по его типу и payload. */
function describe(n: AppNotification): { text: string; to?: string } {
  const p = n.payload;
  switch (n.type) {
    case 'PROJECT_INVITATION':
      return { text: `${p.inviter_name} приглашает вас в проект «${p.project_title}»` };
    case 'CARD_COMMENT':
      return { text: `${p.author_name} прокомментировал карточку «${p.card_title}»`, to: p.todo_id ? `/projects/${p.project_id}/todo/${p.todo_id}?card=${p.card_id}` : `/projects/${p.project_id}` };
    case 'TASK_STATUS_CHANGED':
      return { text: `${p.actor_name} изменил статус задачи «${p.task_title}» на «${p.status_name}»`, to: `/projects/${p.project_id}` };
    case 'FRIEND_REQUEST':
      return { text: `${p.from_username} хочет добавить вас в друзья` };
    case 'FRIEND_ACCEPTED':
      return { text: `${p.username} принял вашу заявку в друзья` };
    default:
      return { text: 'Новое уведомление' };
  }
}

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const t = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(t) - start(d)) / 86_400_000);
  return diff === 0 ? 'Сегодня' : diff === 1 ? 'Вчера' : dayFmt.format(d);
};

/** Требует ответа: приглашение/заявка, которую ещё не приняли и не отклонили */
const isActionable = (n: AppNotification) =>
  (n.type === 'PROJECT_INVITATION' && n.invitation_status === 'PENDING') || (n.type === 'FRIEND_REQUEST' && n.friend_state === 'PENDING');

export default function NotificationsPage() {
  const [folder, setFolder] = useState<'main' | 'hidden'>('main');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [counts, setCounts] = useState({ count: 0, hidden: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, c] = await Promise.all([api.notifications.list(folder), api.notifications.unreadCount()]);
      setItems(list);
      setCounts(c);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить уведомления');
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    setLoading(true);
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

  const urgent = items.filter(isActionable);
  const rest = items.filter((n) => !isActionable(n));
  const groups = useMemo(() => {
    const m = new Map<string, AppNotification[]>();
    for (const n of rest) {
      const k = dayLabel(n.created_at);
      m.set(k, [...(m.get(k) ?? []), n]);
    }
    return [...m.entries()];
  }, [rest]);
  const unreadHere = items.filter((n) => !n.is_read).length;

  const readBtn = (n: AppNotification, busy: boolean) =>
    !n.is_read && (
      <button className="icon-btn" title="Отметить прочитанным" aria-label="Отметить прочитанным" disabled={busy} onClick={() => act(n.id, () => api.notifications.markRead(n.id))}>
        <Icon name="check" size={18} />
      </button>
    );
  const delBtn = (n: AppNotification, busy: boolean) => (
    <button className="icon-btn" title="Удалить" aria-label="Удалить уведомление" disabled={busy} onClick={() => act(n.id, () => api.notifications.remove(n.id))}>
      <Icon name="close" size={18} />
    </button>
  );

  return (
    <div className="wide-page notif-page">
      <div className="page-head">
        <h1>Уведомления</h1>
        <div className="page-actions">
          {unreadHere > 0 && (
            <button className="btn btn-secondary" onClick={() => act(0, () => api.notifications.readAll(folder))}>
              <Icon name="check" size={18} />
              Прочитать все
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => setShowSettings(true)}>
            <Icon name="settings" size={18} />
            Настройки
          </button>
        </div>
      </div>

      <div className="seg notif-tabs" role="tablist">
        <button role="tab" aria-selected={folder === 'main'} className={folder === 'main' ? 'on' : ''} onClick={() => setFolder('main')}>
          Основные{counts.count > 0 ? ` · ${counts.count}` : ''}
        </button>
        <button role="tab" aria-selected={folder === 'hidden'} className={folder === 'hidden' ? 'on' : ''} onClick={() => setFolder('hidden')}>
          Скрытые{counts.hidden > 0 ? ` · ${counts.hidden}` : ''}
        </button>
      </div>

      {error && <div className="notice notice-err">{error}</div>}

      {loading ? (
        <div className="muted">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="empty">
          <Icon name="bell" size={32} />
          <h2>{folder === 'main' ? 'Нет уведомлений' : 'В скрытых пусто'}</h2>
          {folder === 'main' && <p className="muted">Менее важные категории можно убрать в «Скрытые» в настройках.</p>}
        </div>
      ) : (
        <>
          {urgent.length > 0 && (
            <section className="notif-urgent">
              <h2>Требуют ответа <span className="tsection-count">{urgent.length}</span></h2>
              <ul className="notif-list">
                {urgent.map((n) => {
                  const busy = busyId === n.id;
                  const friend = n.type === 'FRIEND_REQUEST';
                  return (
                    <li key={n.id} className="notif notif-big unread">
                      <span className="notif-ico"><Icon name={friend ? 'user-plus' : 'folder'} size={22} /></span>
                      <div className="notif-main">
                        <p>{describe(n).text}</p>
                        <span className="muted">{dayLabel(n.created_at)}, {timeFmt.format(new Date(n.created_at))}</span>
                      </div>
                      <div className="notif-actions">
                        <button
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => act(n.id, async () => { await (friend ? api.friends.accept(n.payload.friend_id) : api.invitations.accept(n.payload.invitation_id)); await api.notifications.markRead(n.id); })}
                        >
                          Принять
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => act(n.id, async () => { await (friend ? api.friends.remove(n.payload.friend_id) : api.invitations.decline(n.payload.invitation_id)); await api.notifications.markRead(n.id); })}
                        >
                          Отклонить
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {groups.map(([label, list]) => (
            <section key={label} className="notif-day">
              <h3>{label}</h3>
              <ul className="notif-list">
                {list.map((n) => {
                  const { text, to } = describe(n);
                  const busy = busyId === n.id;
                  const note =
                    n.type === 'FRIEND_REQUEST'
                      ? n.friend_state === 'ACCEPTED' ? 'Вы теперь друзья' : 'Заявка обработана'
                      : n.type === 'PROJECT_INVITATION'
                        ? n.invitation_status === 'ACCEPTED' ? 'Приглашение принято' : n.invitation_status === 'CANCELED' ? 'Приглашение отозвано' : 'Приглашение отклонено'
                        : null;
                  return (
                    <li key={n.id} className={n.is_read ? 'notif' : 'notif unread'}>
                      <div className="notif-main">
                        <p>{text}</p>
                        <span className="muted">
                          {timeFmt.format(new Date(n.created_at))} · <span className={`ncat ncat-${n.category.toLowerCase()}`}>{CATEGORY[n.category].label}</span>
                          {note && ` · ${note}`}
                        </span>
                      </div>
                      <div className="notif-actions">
                        {n.type === 'PROJECT_INVITATION' && n.invitation_status === 'ACCEPTED' && (
                          <Link className="btn btn-secondary" to={`/projects/${n.payload.project_id}`}>Открыть проект</Link>
                        )}
                        {(n.type === 'FRIEND_REQUEST' && n.friend_state === 'ACCEPTED') || n.type === 'FRIEND_ACCEPTED' ? (
                          <Link className="btn btn-secondary" to="/friends">Друзья</Link>
                        ) : null}
                        {to && (
                          <Link className="btn btn-secondary" to={to} onClick={() => !n.is_read && api.notifications.markRead(n.id).catch(() => undefined)}>
                            Открыть
                          </Link>
                        )}
                        {readBtn(n, busy)}
                        {delBtn(n, busy)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onSaved={load} />}
    </div>
  );
}

function SettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = useState<NotificationSetting[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.notifications.settings().then(setSettings).catch((e) => setError(e.message));
  }, []);

  const toggle = async (c: NotificationCategory, hidden: boolean) => {
    setSettings((s) => s && s.map((x) => (x.category === c ? { ...x, hidden } : x)));
    try {
      await api.notifications.saveSettings({ [c]: hidden });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Modal title="Настройки уведомлений" onClose={onClose}>
      <p className="hint">Приходят все уведомления. Отключённые категории не шумят и не попадают в счётчик, а лежат во вкладке «Скрытые».</p>
      {error && <div className="notice notice-err">{error}</div>}
      <ul className="notif-settings">
        {(settings ?? []).map((s) => (
          <li key={s.category}>
            <label>
              <input type="checkbox" checked={!s.hidden} onChange={(e) => toggle(s.category, !e.target.checked)} />
              <span>
                <b>{CATEGORY[s.category].label}</b>
                <small className="muted">{CATEGORY[s.category].hint}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={onClose}>Готово</button>
      </div>
    </Modal>
  );
}
