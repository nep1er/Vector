import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import Avatar from '../components/Avatar';
import type { DashboardData, DashTask } from '../types';
import { TASK_STATUSES, statusById } from '../utils/status';

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—');
const daysWord = (n: number) => {
  const m = n % 100, l = m % 10;
  return m > 10 && m < 15 ? 'дней' : l === 1 ? 'день' : l >= 2 && l <= 4 ? 'дня' : 'дней';
};

/** Дашборд руководителя: что горит, кто загружен, как идёт прогресс. Доступен с правом EXECUTE. */
export default function DashboardPage() {
  const pid = Number(useParams().projectId);
  const [data, setData] = useState<DashboardData | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  const load = () => {
    api.dashboard.get(pid).then(setData).catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
    api.projects.get(pid).then((p) => setTitle(p.title)).catch(() => undefined);
  }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps

  const link = (t: DashTask) => (t.type === 'TODO' ? `/projects/${pid}/todo/${t.id}` : `/projects/${pid}/roadmap/${t.id}`);

  if (error)
    return (
      <div className="dsh">
        <Link to={`/projects/${pid}`} className="link-btn">← К проекту</Link>
        <div className="notice notice-err">{error}</div>
      </div>
    );
  if (!data) return <div className="dsh"><p className="muted">Загрузка…</p></div>;

  const { tasks, cards } = data;
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.done + w.open));
  const maxLoad = Math.max(1, ...data.people.map((p) => p.assigned));
  const thisWeek = data.weeks[4]?.start;
  const attention = tasks.no_dates + cards.unassigned;

  return (
    <div className="dsh">
      <header className="dsh-head">
        <div>
          <Link to={`/projects/${pid}`} className="link-btn">← К проекту</Link>
          <h1>Дашборд</h1>
          {title && <p className="muted">{title}</p>}
        </div>
        <button className="btn btn-secondary" onClick={load}>Обновить</button>
      </header>

      <div className="dsh-kpis">
        <div className="dsh-kpi">
          <span>Задач в плане</span>
          <b>{tasks.total}</b>
          <small>этапов {tasks.roadmaps} · ToDo {tasks.todos}</small>
        </div>
        <div className="dsh-kpi">
          <span>Выполнено</span>
          <b>{pct(tasks.done, tasks.total)}%</b>
          <small>{tasks.done} из {tasks.total} задач</small>
        </div>
        <div className={tasks.overdue ? 'dsh-kpi bad' : 'dsh-kpi'}>
          <span>Просрочено</span>
          <b>{tasks.overdue}</b>
          <small>срок вышел, не выполнено</small>
        </div>
        <div className="dsh-kpi">
          <span>Карточки</span>
          <b>{pct(cards.done, cards.total)}%</b>
          <small>{cards.done} из {cards.total}{cards.overdue ? ` · просрочено ${cards.overdue}` : ''}</small>
        </div>
        <div className={attention ? 'dsh-kpi warn' : 'dsh-kpi'}>
          <span>Требуют внимания</span>
          <b>{attention}</b>
          <small>без дат {tasks.no_dates} · без исполнителя {cards.unassigned}</small>
        </div>
      </div>

      <div className="dsh-cols">
        <div className="dsh-col">
          <section className="dsh-card">
            <h2>Статусы задач</h2>
            <ul className="dsh-stat">
              {TASK_STATUSES.map((s) => {
                const n = tasks.by_status[s.id] ?? 0;
                return (
                  <li key={s.id} className={n ? undefined : 'zero'}>
                    <i style={{ background: s.color }} />
                    <span className="dsh-stat-name">{s.name}</span>
                    <span className="dsh-track"><em style={{ width: `${pct(n, tasks.total)}%`, background: s.color }} /></span>
                    <b>{n}</b>
                    <span className="dsh-stat-pct">{pct(n, tasks.total)}%</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="dsh-card">
            <h2>Сроки по неделям</h2>
            <p className="dsh-sub">Сколько задач заканчивается в каждую неделю (с понедельника)</p>
            <div className="dsh-weeks">
              {data.weeks.map((w) => {
                const total = w.done + w.open;
                return (
                  <div key={w.start} className={w.start === thisWeek ? 'dsh-week now' : 'dsh-week'} title={`Неделя с ${fmt(w.start)}: выполнено ${w.done}, не закрыто ${w.open}`}>
                    <span className="dsh-week-n">{total || ''}</span>
                    <div className="dsh-week-bar" style={{ height: `${(total / maxWeek) * 100}%` }}>
                      <span className="open" style={{ flex: w.open }} />
                      <span className="done" style={{ flex: w.done }} />
                    </div>
                    <span className="dsh-week-label">{w.start === thisWeek ? 'Сейчас' : fmt(w.start)}</span>
                  </div>
                );
              })}
            </div>
            <ul className="dsh-key">
              <li><i className="open" />Не закрыто</li>
              <li><i className="done" />Выполнено</li>
            </ul>
          </section>

          <section className="dsh-card">
            <h2>Нагрузка участников</h2>
            <p className="dsh-sub">Карточки Канбана на человека</p>
            {data.people.length === 0 ? <p className="muted">Участников нет.</p> : (
              <ul className="dsh-people">
                {data.people.map((p) => {
                  const late = Math.min(p.overdue, p.assigned - p.done);
                  const open = Math.max(0, p.assigned - p.done - late);
                  return (
                    <li key={p.id}>
                      <Avatar user={{ username: p.username, avatar_url: p.avatar_url }} size={28} />
                      <span className="dsh-people-name">{p.username}</span>
                      <span className="dsh-track dsh-load">
                        <em className="done" style={{ width: `${(p.done / maxLoad) * 100}%` }} />
                        <em className="open" style={{ width: `${(open / maxLoad) * 100}%` }} />
                        <em className="late" style={{ width: `${(late / maxLoad) * 100}%` }} />
                      </span>
                      <span className="dsh-people-n">{p.done}/{p.assigned}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            <ul className="dsh-key">
              <li><i className="done" />Закрыто</li>
              <li><i className="open" />В работе</li>
              <li><i className="late" />Просрочено</li>
            </ul>
          </section>
        </div>

        <div className="dsh-col">
          <section className="dsh-card">
            <h2>Просроченные {tasks.overdue > 0 && <span className="dsh-badge bad">{tasks.overdue}</span>}</h2>
            {data.overdue_list.length === 0 ? <p className="muted">Просрочек нет 🎉</p> : (
              <ul className="dsh-list">
                {data.overdue_list.map((t) => (
                  <li key={t.id}><Link to={link(t)}>{t.title}</Link><span className="late">{t.days_late} {daysWord(t.days_late ?? 0)}</span></li>
                ))}
              </ul>
            )}
            {tasks.overdue > data.overdue_list.length && <p className="muted">и ещё {tasks.overdue - data.overdue_list.length}…</p>}
          </section>

          <section className="dsh-card">
            <h2>Ближайшие 7 дней</h2>
            {data.soon_list.length === 0 ? <p className="muted">Ближайших сроков нет.</p> : (
              <ul className="dsh-list">
                {data.soon_list.map((t) => (
                  <li key={t.id}>
                    <Link to={link(t)}>{t.title}</Link>
                    <span className="dsh-due"><i style={{ background: statusById(t.status_id).color }} />{fmt(t.end_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dsh-card">
            <h2>Отстающие ToDo</h2>
            <p className="dsh-sub">Меньше всего закрытых карточек</p>
            {data.todo_progress.length === 0 ? <p className="muted">Нет ToDo с карточками.</p> : (
              <ul className="dsh-list dsh-prog">
                {data.todo_progress.map((t) => (
                  <li key={t.id}>
                    <div className="dsh-prog-top"><Link to={link(t)}>{t.title}</Link><span className="muted">{t.cards_done}/{t.cards_total} · до {fmt(t.end_date)}</span></div>
                    <span className="dsh-track"><em className="done" style={{ width: `${pct(t.cards_done, t.cards_total)}%` }} /></span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="dsh-card">
            <h2>Смещения сроков</h2>
            {data.shifts.count === 0 ? <p className="muted">Смещений не было — план держится.</p> : (
              <>
                <div className="dsh-shift">
                  <div><b>{data.shifts.count}</b><span>смещений</span></div>
                  <div><b>{data.shifts.tasks}</b><span>задач сдвинуто</span></div>
                  <div><b>{data.shifts.days}</b><span>{daysWord(data.shifts.days)} суммарно</span></div>
                </div>
                {data.shifts.last_at && <p className="dsh-sub">Последнее: {new Date(data.shifts.last_at).toLocaleDateString('ru-RU')}. Подробности — в «Смещении сроков» на RoadMap.</p>}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
