import { pool } from '../config/db.js';

/**
 * Видимость задач по ролям (task_role_visibility).
 * Нет строк = видна всем; есть строки = только указанным ролям (+ ADMIN проекта).
 */
export class TaskVisibilityRepository {
  /** Роли, которым доступна задача (пустой массив = все) */
  static async getRoles(taskId, client = pool) {
    const res = await client.query(
      `SELECT r.id, r.name
       FROM task_role_visibility v
       JOIN project_roles r ON r.id = v.project_role_id
       WHERE v.task_id = $1
       ORDER BY r.name;`,
      [taskId]
    );
    return res.rows;
  }

  /** Полностью заменяет список ролей. Пустой список = «Все». */
  static async setRoles(taskId, roleIds) {
    if (!Array.isArray(roleIds)) throw new Error('400: roleIds должен быть массивом');
    const ids = [...new Set(roleIds.map(Number))];
    if (ids.some((n) => !Number.isInteger(n))) throw new Error('400: roleIds — целые числа');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const task = await client.query('SELECT project_id FROM task WHERE id = $1 FOR UPDATE;', [taskId]);
      if (task.rows.length === 0) throw new Error('404: Задача не найдена');
      const projectId = task.rows[0].project_id;

      if (ids.length > 0) {
        const ok = await client.query(
          'SELECT COUNT(*)::int AS n FROM project_roles WHERE project_id = $1 AND id = ANY($2::bigint[]);',
          [projectId, ids]
        );
        if (ok.rows[0].n !== ids.length) {
          throw new Error('400: Одна из ролей не найдена или относится к другому проекту');
        }
      }

      await client.query('DELETE FROM task_role_visibility WHERE task_id = $1;', [taskId]);
      if (ids.length > 0) {
        await client.query(
          `INSERT INTO task_role_visibility (task_id, project_role_id, project_id)
           SELECT $1, rid, $3 FROM unnest($2::bigint[]) AS rid;`,
          [taskId, ids, projectId]
        );
      }
      const roles = await this.getRoles(taskId, client);
      await client.query('COMMIT');
      return roles;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** Видит ли пользователь задачу: все её предки и она сама должны быть открыты ему */
  static async canSee(taskId, userId) {
    const res = await pool.query(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_roadmap_id FROM task WHERE id = $1
         UNION ALL
         SELECT t.id, t.parent_roadmap_id FROM task t JOIN chain c ON t.id = c.parent_roadmap_id
       )
       SELECT NOT EXISTS (
         SELECT 1 FROM chain c
         WHERE EXISTS (SELECT 1 FROM task_role_visibility v WHERE v.task_id = c.id)
           AND NOT EXISTS (
             SELECT 1
             FROM task_role_visibility v
             JOIN assigned_roles ar ON ar.project_role_id = v.project_role_id
             JOIN project_participants pp ON pp.id = ar.project_participant_id
             WHERE v.task_id = c.id AND pp.user_id = $2
           )
       ) AS ok;`,
      [taskId, userId]
    );
    return res.rows[0].ok;
  }

  /** id ролей пользователя в проекте */
  static async userRoleIds(userId, projectId) {
    const res = await pool.query(
      `SELECT ar.project_role_id AS id
       FROM project_participants pp
       JOIN assigned_roles ar ON ar.project_participant_id = pp.id
       WHERE pp.user_id = $1 AND pp.project_id = $2;`,
      [userId, projectId]
    );
    return res.rows.map((r) => r.id);
  }
}
