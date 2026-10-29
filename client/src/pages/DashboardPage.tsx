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
      <div className="dash">
        <Link to={`/projects/${pid}`} className="link-btn">← К проекту</Link>
        <div className="notice notice-err">{error}</div>
      </div>
    );
  if (!data) return <div className="dash"><p className="muted">Загрузка…</p></div>;

  const { tasks, cards } = data;
  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.done + w.open));
  const maxLoad = Math.max(1, ...data.people.map((p) => p.assigned));
  const thisWeek = data.weeks[4]?.start;

  return (
    <div className="dash">
      <div className="dash-head">
        <div>
          <Link to={`/projects/${pid}`} className="link-btn">← К проекту</Link>
          <h1>Дашборд{title ? ` · ${title}` : ''}</h1>
        </div>
        <button className="btn btn-secondary" onClick={load}>Обновить</button>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="kpi-label">Задач в плане</span><b>{tasks.total}</b><span className="muted">этапов {tasks.roadmaps} · ToDo {tasks.todos}</span></div>
        <div className="kpi"><span className="kpi-label">Выполнено</span><b>{pct(tasks.done, tasks.total)}%</b><span className="muted">{tasks.done} из {tasks.total}</span></div>
        <div className={tasks.overdue ? 'kpi kpi-bad' : 'kpi'}><span className="kpi-label">Просрочено</span><b>{tasks.overdue}</b><span className="muted">срок вышел, не выполнено</span></div>
        <div className="kpi"><span className="kpi-label">Карточки</span><b>{pct(cards.done, cards.total)}%</b><span className="muted">{cards.done} из {cards.total} · просрочено {cards.overdue}</span></div>
        <div className={tasks.no_dates || cards.unassigned ? 'kpi kpi-warn' : 'kpi'}><span className="kpi-label">Требуют внимания</span><b>{tasks.no_dates + cards.unassigned}</b><span className="muted">без дат {tasks.no_dates} · без исполнителя {cards.unassigned}</span></div>
      </div>

      <div className="dash-grid">
        <section className="panel dash-wide">
          <h2>Статусы задач</h2>
          <div className="stack-bar" role="img" aria-label="Распределение по статусам">
            {TASK_STATUSES.map((s) => {
              const n = tasks.by_status[s.id] ?? 0;
              return n ? <span key={s.id} style={{ width: `${pct(n, tasks.total)}%`, background: s.color }} title={`${s.name}: ${n}`} /> : null;
            })}
          </div>
          <ul className="legend">
            {TASK_STATUSES.map((s) => (
              <li key={s.id}><i style={{ background: s.color }} />{s.name}<b>{tasks.by_status[s.id] ?? 0}</b></li>
            ))}
          </ul>
        </section>

        <section className="panel dash-wide">
          <h2>Сроки по неделям <span className="muted">— сколько задач заканчивается</span></h2>
          <div className="week-chart">
            {data.weeks.map((w) => (
              <div key={w.start} className={w.start === thisWeek ? 'week now' : 'week'} title={`Неделя с ${fmt(w.start)}: выполнено ${w.done}, не закрыто ${w.open}`}>
                <div className="week-bars" style={{ height: `${((w.done + w.open) / maxWeek) * 100}%` }}>
                  <span className="wb-open" style={{ flex: w.open }} />
                  <span className="wb-done" style={{ flex: w.done }} />
                </div>
                <span className="week-label">{fmt(w.start)}</span>
              </div>
            ))}
          </div>
          <ul className="legend"><li><i className="lg-open" />Не закрыто</li><li><i className="lg-done" />Выполнено</li></ul>
        </section>

        <section className="panel">
          <h2>Просроченные</h2>
          {data.overdue_list.length === 0 ? <p className="muted">Просрочек нет 🎉</p> : (
            <ul className="dash-list">
              {data.overdue_list.map((t) => (
                <li key={t.id}><Link to={link(t)}>{t.title}</Link><span className="late">{t.days_late} {daysWord(t.days_late ?? 0)}</span></li>
              ))}
            </ul>
          )}
          {tasks.overdue > data.overdue_list.length && <p className="muted">и ещё {tasks.overdue - data.overdue_list.length}…</p>}
        </section>

        <section className="panel">
          <h2>Ближайшие 7 дней</h2>
          {data.soon_list.length === 0 ? <p className="muted">Ближайших сроков нет.</p> : (
            <ul className="dash-list">
              {data.soon_list.map((t) => (
                <li key={t.id}><Link to={link(t)}>{t.title}</Link><span className="muted"><i className="dot" style={{ background: statusById(t.status_id).color }} />{fmt(t.end_date)}</span></li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Нагрузка участников <span className="muted">— карточки</span></h2>
          {data.people.length === 0 ? <p className="muted">Участников нет.</p> : (
            <ul className="people">
              {data.people.map((p) => (
                <li key={p.id}>
                  <Avatar user={{ username: p.username, avatar_url: p.avatar_url }} size={32} />
                  <div className="people-main">
                    <div className="people-top"><span>{p.username}</span><span className="muted">{p.done}/{p.assigned}{p.overdue ? ` · просрочено ${p.overdue}` : ''}</span></div>
                    <div className="meter"><span className="meter-done" style={{ width: `${(p.done / maxLoad) * 100}%` }} /><span className={p.overdue ? 'meter-late' : 'meter-open'} style={{ width: `${((p.assigned - p.done) / maxLoad) * 100}%` }} /></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Отстающие ToDo <span className="muted">— меньше всего закрытых карточек</span></h2>
          {data.todo_progress.length === 0 ? <p className="muted">Нет ToDo с карточками.</p> : (
            <ul className="dash-list">
              {data.todo_progress.map((t) => (
                <li key={t.id} className="prog">
                  <div className="prog-top"><Link to={link(t)}>{t.title}</Link><span className="muted">{t.cards_done}/{t.cards_total} · до {fmt(t.end_date)}</span></div>
                  <div className="meter"><span className="meter-done" style={{ width: `${pct(t.cards_done, t.cards_total)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel dash-wide">
          <h2>Смещения сроков</h2>
          {data.shifts.count === 0 ? <p className="muted">Смещений не было — план держится.</p> : (
            <p>
              Смещений: <b>{data.shifts.count}</b> · сдвинуто задач (без отменённых): <b>{data.shifts.tasks}</b> · суммарно <b>{data.shifts.days}</b> {daysWord(data.shifts.days)}
              {data.shifts.last_at ? <span className="muted"> · последнее {new Date(data.shifts.last_at).toLocaleDateString('ru-RU')}</span> : null}. Подробности — в «Смещении сроков» на RoadMap.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
