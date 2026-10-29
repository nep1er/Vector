import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import type { MyTaskBucket, MyTaskItem, MyTasksProject } from '../types';
import { statusById } from '../utils/status';

const SECTIONS: { id: MyTaskBucket; title: string; hint: string }[] = [
  { id: 'soon', title: 'Сроки на подходе', hint: 'закончатся в ближайшие 3 дня' },
  { id: 'current', title: 'Текущие', hint: 'в работе, срок ещё не близко' },
  { id: 'overdue', title: 'Просроченные', hint: 'срок вышел, а задача не закрыта' },
];

const KIND_LABEL: Record<MyTaskItem['type'], string> = { ROADMAP: 'RoadMap', TODO: 'ToDo', CARD: 'Карточка' };

const DAY = 86_400_000;
const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

/** «через 2 дн.», «сегодня», «просрочено на 3 дн.» */
function dueLabel(iso: string | null): { text: string; late: boolean } {
  if (!iso) return { text: 'без срока', late: false };
  const due = new Date(iso);
  const days = Math.round((due.getTime() - Date.now()) / DAY);
  const date = dateFmt.format(due);
  if (due.getTime() < Date.now()) {
    const n = Math.max(1, Math.round((Date.now() - due.getTime()) / DAY));
    return { text: `${date} · просрочено на ${n} дн.`, late: true };
  }
  if (days <= 0) return { text: `${date} · сегодня`, late: false };
  return { text: `${date} · через ${days} дн.`, late: false };
}

const linkFor = (projectId: number, it: MyTaskItem) =>
  it.kind === 'card'
    ? `/projects/${projectId}/todo/${it.task_id}?card=${it.id}`
    : it.type === 'TODO'
      ? `/projects/${projectId}/todo/${it.id}`
      : `/projects/${projectId}/roadmap/${it.id}`;

export default function TasksPage() {
  const [data, setData] = useState<MyTasksProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.myTasks
      .list()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить задачи'))
      .finally(() => setLoading(false));
  }, []);

  // По умолчанию — только «свои»: где вы исполнитель карточки или задача открыта именно вашим ролям
  const groups = useMemo(
    () =>
      data
        .map((g) => ({ ...g, items: g.items.filter((i) => showAll || i.mine || i.targeted) }))
        .filter((g) => g.items.length > 0),
    [data, showAll],
  );
  const hiddenCount = useMemo(
    () => data.reduce((n, g) => n + g.items.filter((i) => !(i.mine || i.targeted)).length, 0),
    [data],
  );

  return (
    <>
      <div className="page-head">
        <h1>Задачи</h1>
        <label className="tasks-toggle">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>
            Показывать все доступные мне
            {!showAll && hiddenCount > 0 ? ` (ещё ${hiddenCount})` : ''}
          </span>
        </label>
      </div>

      {error && <div className="notice notice-err">{error}</div>}
      {loading && <p className="muted">Загрузка…</p>}

      {!loading && !error && groups.length === 0 && (
        <div className="empty">
          <Icon name="tasks" size={32} />
          <h2>Нет назначенных задач</h2>
          <p className="muted">
            Здесь появятся карточки, где вы исполнитель, и задачи, открытые вашей роли.
            {hiddenCount > 0 && ' Остальные доступные задачи можно показать переключателем сверху.'}
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.project.id} className="tproject">
          <h2 className="tproject-title">
            <Link to={`/projects/${g.project.id}`}>{g.project.title}</Link>
            <span className="tproject-count">{g.items.length}</span>
          </h2>

          {SECTIONS.map((sec) => {
            const items = g.items.filter((i) => i.bucket === sec.id);
            if (items.length === 0) return null;
            return (
              <div key={sec.id} className={`tsection tsection-${sec.id}`}>
                <h3 className="tsection-head">
                  {sec.title} <span className="tsection-count">{items.length}</span>
                  <span className="muted tsection-hint">{sec.hint}</span>
                </h3>
                <ul className="titems">
                  {items.map((it) => {
                    const due = dueLabel(it.due_date);
                    return (
                      <li key={`${it.kind}-${it.id}`} className="titem">
                        <span className={`titem-type titem-type-${it.type.toLowerCase()}`}>{KIND_LABEL[it.type]}</span>
                        <div className="titem-main">
                          <span className="titem-title">{it.title}</span>
                          <span className="titem-sub">
                            {it.kind === 'card' && `в «${it.parent_title}» · колонка «${it.column_title}» · `}
                            <span className={due.late ? 'titem-late' : undefined}>{due.text}</span>
                            {it.status_id != null && ` · ${statusById(it.status_id).name}`}
                          </span>
                        </div>
                        {it.mine ? (
                          <span className="titem-why titem-why-mine">Вы исполнитель</span>
                        ) : it.targeted ? (
                          <span className="titem-why">Для вашей роли</span>
                        ) : null}
                        <Link className="btn btn-secondary titem-go" to={linkFor(g.project.id, it)}>
                          Перейти
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      ))}
    </>
  );
}
