import { pool } from '../config/db.js';
import { RoleRepository } from './RoleRepository.js';
import { TaskRepository } from './TaskRepository.js';

const DONE_STATUS_ID = 1; // task_status: «Выполнено»
const DAY = 86_400_000;

/**
 * «Мои задачи» для вкладки «Задачи»: по каждому проекту три группы —
 *   soon    «Сроки на подходе»  (конец срока в ближайшие `soonDays` дней),
 *   current «Текущие»           (всё остальное незавершённое),
 *   overdue «Просроченные»      (срок вышел, а задача не закрыта).
 * Своими считаются:
 *   1) карточки, где пользователь — исполнитель (mine = true);
 *   2) задачи RoadMap/ToDo, которые видны именно его ролям (targeted = true: у задачи задана видимость по ролям,
 *      и среди них есть роль пользователя). Остальные видимые задачи помечены targeted = false —
 *      клиент по умолчанию их скрывает и показывает по переключателю.
 * Внутри группы сначала идут карточки-исполнителю, потом задачи по ролям, потом остальные; дальше по сроку.
 * Скрытые от роли задачи (и всё внутри них) не попадают в выдачу; администратор видит всё.
 */
export class MyTasksRepository {
  static async forUser(userId, { soonDays = 3, now = new Date() } = {}) {
    const projects = await pool.query(
      `SELECT p.id, p.title FROM project p
       JOIN project_participants pp ON pp.project_id = p.id
       WHERE pp.user_id = $1 ORDER BY p.title;`,
      [userId]
    );

    const result = [];
    for (const project of projects.rows) {
      const permissions = await RoleRepository.getUserPermissionsInProject(userId, project.id);
      const seeAll = permissions.includes('ADMIN');
      const roleIds = new Set(
        (
          await pool.query(
            `SELECT ar.project_role_id AS id FROM project_participants pp
             JOIN assigned_roles ar ON ar.project_participant_id = pp.id
             WHERE pp.user_id = $1 AND pp.project_id = $2;`,
            [userId, project.id]
          )
        ).rows.map((r) => Number(r.id))
      );

      const tree = await TaskRepository.getProjectTree(project.id, { userId, seeAll });
      const flat = [];
      const walk = (nodes, depth) => nodes.forEach((n) => (flat.push({ ...n, depth }), walk(n.children, depth + 1)));
      walk(tree, 0);
      const rootId = tree[0]?.id;
      const visibleIds = new Set(flat.map((t) => t.id));

      const items = [];
      for (const t of flat) {
        if (t.id === rootId || t.status_id === DONE_STATUS_ID) continue;
        items.push({
          kind: 'task',
          id: t.id,
          task_id: t.id,
          type: t.type, // ROADMAP | TODO
          title: t.title,
          status_id: t.status_id,
          start_date: t.start_date,
          due_date: t.end_date,
          parent_id: t.parent_roadmap_id,
          mine: false,
          targeted: (t.visible_roles ?? []).some((r) => roleIds.has(Number(r.id))),
        });
      }

      const cards = await pool.query(
        `SELECT c.id, c.title, c.work_date, c.card_status_id, col.todo_task_id, col.title AS column_title, t.title AS todo_title
         FROM card_participants cp
         JOIN project_participants pp ON pp.id = cp.project_participant_id
         JOIN kanban_card c ON c.id = cp.kanban_card_id
         JOIN kanban_column col ON col.id = c.kanban_column_id
         JOIN task t ON t.id = col.todo_task_id
         WHERE pp.user_id = $1 AND t.project_id = $2 AND c.card_status_id <> 1;`,
        [userId, project.id]
      );
      for (const c of cards.rows) {
        if (!visibleIds.has(c.todo_task_id)) continue;
        items.push({
          kind: 'card',
          id: c.id,
          task_id: c.todo_task_id,
          type: 'CARD',
          title: c.title,
          status_id: null,
          start_date: null,
          due_date: c.work_date,
          parent_title: c.todo_title,
          column_title: c.column_title,
          mine: true,
          targeted: false,
        });
      }

      const nowMs = now.getTime();
      for (const it of items) {
        const due = it.due_date ? new Date(it.due_date).getTime() : null;
        const overdue = it.status_id === 4 || (due !== null && due < nowMs);
        it.bucket = overdue ? 'overdue' : due !== null && due - nowMs <= soonDays * DAY ? 'soon' : 'current';
        it.rank = it.mine ? 0 : it.targeted ? 1 : 2;
      }
      items.sort(
        (a, b) =>
          a.rank - b.rank ||
          (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity) ||
          a.title.localeCompare(b.title, 'ru')
      );
      if (items.length > 0) result.push({ project: { id: project.id, title: project.title }, items });
    }
    return result;
  }
}
