import { pool } from '../config/db.js';
import { TaskRepository } from './TaskRepository.js';

const DAY = 86_400_000;
const DONE = 1;
const CARD_DONE = 1;

const flatten = (nodes, acc = []) => {
  for (const n of nodes) {
    acc.push(n);
    flatten(n.children, acc);
  }
  return acc;
};
const startOfDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const weekStart = (ms) => {
  const d = new Date(ms);
  const dow = (d.getUTCDay() + 6) % 7; // понедельник = 0
  return startOfDay(d) - dow * DAY;
};

/** Дашборд руководителя: сводка по проекту (учитывает видимость задач для пользователя). */
export class DashboardRepository {
  static async forProject(projectId, { userId, seeAll }) {
    const tree = await TaskRepository.getProjectTree(projectId, { userId, seeAll });
    const nodes = flatten(tree).filter((n) => n.parent_roadmap_id !== null && n.parent_roadmap_id !== undefined); // без корневой RoadMap
    const ids = nodes.map((n) => n.id);
    const now = Date.now();
    const today = startOfDay(new Date());

    // --- задачи ---
    const isOverdue = (n) => n.status_id !== DONE && n.end_date && new Date(n.end_date).getTime() < now;
    const byStatus = {};
    for (const n of nodes) byStatus[n.status_id] = (byStatus[n.status_id] ?? 0) + 1;
    const tasks = {
      total: nodes.length,
      roadmaps: nodes.filter((n) => n.type === 'ROADMAP').length,
      todos: nodes.filter((n) => n.type === 'TODO').length,
      done: nodes.filter((n) => n.status_id === DONE).length,
      overdue: nodes.filter(isOverdue).length,
      no_dates: nodes.filter((n) => !n.start_date || !n.end_date).length,
      by_status: byStatus,
    };
    const brief = (n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      status_id: n.status_id,
      end_date: n.end_date,
      parent_roadmap_id: n.parent_roadmap_id,
    });
    const overdueList = nodes
      .filter(isOverdue)
      .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
      .slice(0, 8)
      .map((n) => ({ ...brief(n), days_late: Math.max(1, Math.ceil((now - new Date(n.end_date).getTime()) / DAY)) }));
    const soonList = nodes
      .filter((n) => n.status_id !== DONE && n.end_date && new Date(n.end_date).getTime() >= now && new Date(n.end_date).getTime() <= now + 7 * DAY)
      .sort((a, b) => new Date(a.end_date) - new Date(b.end_date))
      .slice(0, 8)
      .map(brief);

    // нагрузка по неделям: сколько задач заканчивается в каждую неделю (4 назад … 8 вперёд)
    const w0 = weekStart(today) - 4 * 7 * DAY;
    const weeks = Array.from({ length: 13 }, (_, i) => ({ start: new Date(w0 + i * 7 * DAY).toISOString().slice(0, 10), done: 0, open: 0 }));
    for (const n of nodes) {
      if (!n.end_date) continue;
      const idx = Math.floor((weekStart(new Date(n.end_date).getTime()) - w0) / (7 * DAY));
      if (idx >= 0 && idx < weeks.length) weeks[idx][n.status_id === DONE ? 'done' : 'open']++;
    }

    // --- карточки Канбана ---
    const todoIds = nodes.filter((n) => n.type === 'TODO').map((n) => n.id);
    let cards = { total: 0, done: 0, overdue: 0, unassigned: 0 };
    let people = [];
    let todoProgress = [];
    if (todoIds.length) {
      const cardRows = (
        await pool.query(
          `SELECT c.id, c.card_status_id, c.work_date, col.todo_task_id,
                  COALESCE(array_agg(cp.project_participant_id) FILTER (WHERE cp.project_participant_id IS NOT NULL), '{}') AS assignees
           FROM kanban_card c
           JOIN kanban_column col ON col.id = c.kanban_column_id
           LEFT JOIN card_participants cp ON cp.kanban_card_id = c.id
           WHERE col.todo_task_id = ANY($1::bigint[])
           GROUP BY c.id, col.todo_task_id;`,
          [todoIds]
        )
      ).rows;
      const members = (
        await pool.query(
          `SELECT pp.id, u.id AS user_id, u.username, u.avatar_url
           FROM project_participants pp JOIN users u ON u.id = pp.user_id WHERE pp.project_id = $1;`,
          [projectId]
        )
      ).rows;
      const byPerson = new Map(members.map((m) => [Number(m.id), { ...m, assigned: 0, done: 0, overdue: 0 }]));
      const byTodo = new Map();
      for (const c of cardRows) {
        const done = c.card_status_id === CARD_DONE;
        const late = !done && c.work_date && new Date(c.work_date).getTime() < today;
        cards.total++;
        if (done) cards.done++;
        if (late) cards.overdue++;
        if (c.assignees.length === 0) cards.unassigned++;
        for (const a of c.assignees) {
          const p = byPerson.get(Number(a));
          if (!p) continue;
          p.assigned++;
          if (done) p.done++;
          if (late) p.overdue++;
        }
        const t = byTodo.get(Number(c.todo_task_id)) ?? { total: 0, done: 0 };
        t.total++;
        if (done) t.done++;
        byTodo.set(Number(c.todo_task_id), t);
      }
      people = [...byPerson.values()].sort((a, b) => b.assigned - a.assigned || a.username.localeCompare(b.username));
      todoProgress = nodes
        .filter((n) => n.type === 'TODO')
        .map((n) => {
          const t = byTodo.get(n.id) ?? { total: 0, done: 0 };
          return { ...brief(n), cards_total: t.total, cards_done: t.done };
        })
        .filter((n) => n.cards_total > 0 && n.status_id !== DONE)
        .sort((a, b) => a.cards_done / a.cards_total - b.cards_done / b.cards_total)
        .slice(0, 8);
    } else {
      people = (
        await pool.query(
          `SELECT pp.id, u.id AS user_id, u.username, u.avatar_url, 0 AS assigned, 0 AS done, 0 AS overdue
           FROM project_participants pp JOIN users u ON u.id = pp.user_id WHERE pp.project_id = $1 ORDER BY u.username;`,
          [projectId]
        )
      ).rows;
    }

    // --- смещения сроков ---
    const sh = (
      await pool.query(
        `SELECT count(*)::int AS count, COALESCE(sum(abs(shift_days)) FILTER (WHERE reverted_at IS NULL), 0)::int AS days,
                COALESCE(sum(tasks_count) FILTER (WHERE reverted_at IS NULL), 0)::int AS tasks,
                max(created_at) AS last_at
         FROM task_shift WHERE project_id = $1;`,
        [projectId]
      )
    ).rows[0];

    return { generated_at: new Date().toISOString(), tasks, overdue_list: overdueList, soon_list: soonList, weeks, cards, people, todo_progress: todoProgress, shifts: sh };
  }
}
