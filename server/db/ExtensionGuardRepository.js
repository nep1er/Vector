import { pool } from '../config/db.js';

const DONE = 1; // task_status.id = «Выполнено»
const MAX_BLOCKERS = 50;

/**
 * «Стражи» расширений: декларативные правила, которые ядро применяет само.
 * Код расширения на сервере НЕ выполняется — расширение лишь объявляет правило в манифесте
 * и хранит для него данные в extension_data. Правило работает, только если расширение
 * установлено, включено, одобрено, автор не забанен и проект выдал право guard:task-status.
 *
 * Тип task-blocked-by: перед переводом задачи в один из statuses (и, если cards=true, перед началом/завершением
 * карточки Канбана этой ToDo-задачи) проверяем, что все задачи-предшественники из data[collection][taskId][field] выполнены.
 */
export class ExtensionGuardRepository {
  static async activeGuards(projectId, forCards = false) {
    const res = await pool.query(
      `SELECT pe.extension_id, e.name, v.manifest
       FROM project_extension pe
       JOIN extension e ON e.id = pe.extension_id
       JOIN extension_version v ON v.id = pe.version_id
       WHERE pe.project_id = $1 AND pe.enabled AND e.status = 'ACTIVE' AND v.status = 'APPROVED'
         AND 'guard:task-status' = ANY(pe.granted_permissions)
         AND NOT EXISTS (SELECT 1 FROM extension_ban b WHERE b.user_id = e.author_id);`,
      [projectId]
    );
    const out = [];
    for (const r of res.rows) {
      for (const g of r.manifest.guards ?? []) {
        if (g.type === 'task-blocked-by' && (!forCards || g.cards)) out.push({ extensionId: r.extension_id, extensionName: r.name, guard: g });
      }
    }
    return out;
  }

  /** Бросает 409, если у задачи есть невыполненные предшественники по правилу g */
  static async assertNotBlocked(projectId, taskId, { extensionId, extensionName, guard }, completing) {
    const row = await pool.query(
      'SELECT value FROM extension_data WHERE project_id = $1 AND extension_id = $2 AND collection = $3 AND key = $4;',
      [projectId, extensionId, guard.collection, String(taskId)]
    );
    const raw = row.rows[0]?.value?.[guard.field];
    const ids = (Array.isArray(raw) ? raw : []).map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== Number(taskId)).slice(0, MAX_BLOCKERS);
    if (ids.length === 0) return;
    const open = await pool.query(
      'SELECT id, title FROM task WHERE project_id = $1 AND id = ANY($2::bigint[]) AND status_id <> $3 ORDER BY id;',
      [projectId, ids, DONE]
    );
    if (open.rows.length === 0) return;
    const first = open.rows[0].title;
    const more = open.rows.length > 1 ? ` (и ещё ${open.rows.length - 1})` : '';
    throw new Error(`409: ${completing ? 'Нельзя завершить' : 'Нельзя начать работу'}: сначала завершите задачу «${first}»${more}. Правило расширения «${extensionName}»`);
  }

  /** Перед сменой статуса задачи */
  static async checkTaskStatus(task, newStatusId) {
    const status = Number(newStatusId);
    for (const g of await this.activeGuards(task.project_id)) {
      if (g.guard.statuses.includes(status)) await this.assertNotBlocked(task.project_id, task.id, g, status === DONE);
    }
  }

  /** Перед завершением карточки или её переносом из первой колонки (начало работы) */
  static async checkCard({ cardId, targetColumnId, completing }) {
    const col = (
      await pool.query(
        `SELECT c.todo_task_id AS todo_id, t.project_id
         FROM kanban_card k JOIN kanban_column c ON c.id = k.kanban_column_id JOIN task t ON t.id = c.todo_task_id
         WHERE k.id = $1;`,
        [cardId]
      )
    ).rows[0];
    if (!col) return;
    let starting = false;
    if (targetColumnId != null) {
      const pos = await pool.query(
        `SELECT (SELECT position FROM kanban_column WHERE id = $2) AS target_pos,
                (SELECT min(position) FROM kanban_column WHERE todo_task_id = $1) AS first_pos;`,
        [col.todo_id, targetColumnId]
      );
      const r = pos.rows[0];
      starting = r.target_pos != null && r.target_pos > r.first_pos;
    }
    if (!completing && !starting) return;
    for (const g of await this.activeGuards(col.project_id, true)) {
      await this.assertNotBlocked(col.project_id, col.todo_id, g, !!completing && !starting);
    }
  }
}
