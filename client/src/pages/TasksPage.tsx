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

type Rank = 'mine' | 'targeted' | 'other';
const rankOf = (i: MyTaskItem): Rank => (i.mine ? 'mine' : i.targeted ? 'targeted' : 'other');
const RANKS: { id: Rank; title: string }[] = [
  { id: 'mine', title: 'Вы исполнитель' },
  { id: 'targeted', title: 'Для вашей роли' },
  { id: 'other', title: 'Остальные доступные' },
];

export default function TasksPage() {
  const [data, setData] = useState<MyTasksProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  useEffect(() => {
    api.myTasks
      .list()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить задачи'))
      .finally(() => setLoading(false));
  }, []);

  // По умолчанию показываем всё доступное, но «свои» выделены и стоят первыми в каждой группе
  const groups = useMemo(
    () =>
      data
        .map((g) => ({ ...g, items: g.items.filter((i) => !onlyMine || i.mine || i.targeted) }))
        .filter((g) => g.items.length > 0),
    [data, onlyMine],
  );

  const totals = useMemo(() => {
    const t = { overdue: [0, 0], soon: [0, 0], current: [0, 0] } as Record<MyTaskBucket, number[]>;
    for (const g of data) for (const i of g.items) t[i.bucket][i.mine ? 0 : 1]++;
    return t;
  }, [data]);

  return (
    <div className="wide-page">
      <div className="page-head">
        <h1>Задачи</h1>
        <div className="seg" role="radiogroup" aria-label="Какие задачи показывать">
          <button role="radio" aria-checked={!onlyMine} className={!onlyMine ? 'on' : ''} onClick={() => setOnlyMine(false)}>
            Все доступные
          </button>
          <button role="radio" aria-checked={onlyMine} className={onlyMine ? 'on' : ''} onClick={() => setOnlyMine(true)}>
            Только мои
          </button>
        </div>
      </div>

      {!loading && !error && (
        <div className="tsummary">
          {(
            [
              ['overdue', 'Просрочено', 'tsum-overdue'],
              ['soon', 'Сроки на подходе', 'tsum-soon'],
              ['current', 'Текущие', 'tsum-current'],
            ] as const
          ).map(([id, label, cls]) => (
            <div key={id} className={`tsum ${cls}`}>
              <b>{totals[id][0]}</b>
              <span>{label}</span>
              <small>ваших · ещё {totals[id][1]} доступных</small>
            </div>
          ))}
        </div>
      )}

      {error && <div className="notice notice-err">{error}</div>}
      {loading && <p className="muted">Загрузка…</p>}

      {!loading && !error && groups.length === 0 && (
        <div className="empty">
          <Icon name="tasks" size={32} />
          <h2>Задач пока нет</h2>
          <p className="muted">Здесь появятся карточки, где вы исполнитель, и все доступные вам задачи проектов.</p>
        </div>
      )}

      <div className="tprojects">
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
                  {RANKS.map((r) => {
                    const part = items.filter((i) => rankOf(i) === r.id);
                    if (part.length === 0) return null;
                    return (
                      <div key={r.id} className={`trank trank-${r.id}`}>
                        {(items.some((i) => rankOf(i) !== 'other') || r.id !== 'other') && (
                          <div className="trank-label">{r.title}</div>
                        )}
                        <ul className="titems">
                          {part.map((it) => {
                            const due = dueLabel(it.due_date);
                            return (
                              <li key={`${it.kind}-${it.id}`} className={`titem titem-${r.id}`}>
                                <span className={`titem-type titem-type-${it.type.toLowerCase()}`}>{KIND_LABEL[it.type]}</span>
                                <div className="titem-main">
                                  <span className="titem-title">{it.title}</span>
                                  <span className="titem-sub">
                                    {it.kind === 'card' && `в «${it.parent_title}» · колонка «${it.column_title}» · `}
                                    <span className={due.late ? 'titem-late' : undefined}>{due.text}</span>
                                    {it.status_id != null && ` · ${statusById(it.status_id).name}`}
                                  </span>
                                </div>
                                {it.mine && <span className="titem-why titem-why-mine">Вы исполнитель</span>}
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
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
