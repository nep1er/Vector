import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Icon from '../components/Icon';
import type { MyTaskBucket, MyTaskItem, MyTasksProject } from '../types';
import { statusById } from '../utils/status';

const SECTIONS: { id: MyTaskBucket; title: string; hint: string }[] = [
  { id: 'overdue', title: 'Просрочено', hint: 'срок вышел, задача не закрыта' },
  { id: 'soon', title: 'Скоро срок', hint: 'закончатся в ближайшие 3 дня' },
  { id: 'current', title: 'В работе', hint: 'срок ещё не близко' },
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
  const [bucket, setBucket] = useState<MyTaskBucket | null>(null);

  useEffect(() => {
    api.myTasks
      .list()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить задачи'))
      .finally(() => setLoading(false));
  }, []);

  // Показываем всё доступное; «свои» и «для вашей роли» стоят первыми в каждой группе
  const groups = useMemo(
    () =>
      data
        .map((g) => ({
          ...g,
          items: g.items
            .filter((i) => (!onlyMine || i.mine || i.targeted) && (!bucket || i.bucket === bucket))
            .sort((a, b) => RANKS.findIndex((r) => r.id === rankOf(a)) - RANKS.findIndex((r) => r.id === rankOf(b))),
        }))
        .filter((g) => g.items.length > 0),
    [data, onlyMine, bucket],
  );

  const totals = useMemo(() => {
    const t = { overdue: 0, soon: 0, current: 0 } as Record<MyTaskBucket, number>;
    for (const g of data) for (const i of g.items) if (!onlyMine || i.mine || i.targeted) t[i.bucket]++;
    return t;
  }, [data, onlyMine]);

  return (
    <div className="wide-page">
      <div className="page-head">
        <h1>Задачи</h1>
        <div className="seg" role="radiogroup" aria-label="Какие задачи показывать">
          <button role="radio" aria-checked={!onlyMine} className={!onlyMine ? 'on' : ''} onClick={() => setOnlyMine(false)}>
            Все доступные
          </button>
          <button role="radio" aria-checked={onlyMine} className={onlyMine ? 'on' : ''} onClick={() => setOnlyMine(true)}>
            Мои и для моей роли
          </button>
        </div>
      </div>

      {!loading && !error && (
        <div className="tsummary" role="group" aria-label="Фильтр по срокам">
          {SECTIONS.map((sec) => (
            <button
              key={sec.id}
              type="button"
              aria-pressed={bucket === sec.id}
              className={`tsum tsum-${sec.id}${bucket === sec.id ? ' on' : ''}`}
              onClick={() => setBucket(bucket === sec.id ? null : sec.id)}
            >
              <b>{totals[sec.id]}</b>
              <span>{sec.title}</span>
              <small>{sec.hint}</small>
            </button>
          ))}
        </div>
      )}

      {error && <div className="notice notice-err">{error}</div>}
      {loading && <p className="muted">Загрузка…</p>}

      {!loading && !error && groups.length === 0 && (
        <div className="empty">
          <Icon name="tasks" size={32} />
          <h2>Задач нет</h2>
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
                    <i className="tsection-dot" />
                    {sec.title}
                    <span className="tsection-count">{items.length}</span>
                  </h3>
                  <ul className="titems">
                    {items.map((it) => {
                      const due = dueLabel(it.due_date);
                      const rank = rankOf(it);
                      const st = it.status_id != null ? statusById(it.status_id) : null;
                      return (
                        <li key={`${it.kind}-${it.id}`}>
                          <Link className="trow" to={linkFor(g.project.id, it)}>
                            <span className="trow-main">
                              <span className="trow-title">{it.title}</span>
                              <span className="trow-path">
                                <span className="trow-kind">{KIND_LABEL[it.type]}</span>
                                {it.kind === 'card' && <span>{it.parent_title} › {it.column_title}</span>}
                              </span>
                            </span>
                            {rank !== 'other' && <span className={`trow-who trow-who-${rank}`}>{rank === 'mine' ? 'Вы' : 'Ваша роль'}</span>}
                            {st && (
                              <span className="trow-status">
                                <i style={{ background: st.color }} />
                                {st.name}
                              </span>
                            )}
                            <span className={due.late ? 'trow-due late' : 'trow-due'}>{due.text}</span>
                            <span className="trow-go" aria-hidden="true">›</span>
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
      </div>
    </div>
  );
}
