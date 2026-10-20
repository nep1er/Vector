import { pool } from '../config/db.js';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function cleanName(name) {
  const clean = String(name ?? '').trim();
  if (!clean) throw new Error('400: Название тега обязательно');
  if (clean.length > 50) throw new Error('400: Название тега — не длиннее 50 символов');
  return clean;
}

function cleanColor(color) {
  if (color == null || color === '') return null;
  if (!HEX_COLOR.test(String(color))) {
    throw new Error('400: Цвет должен быть в формате HEX, например #4A90D9');
  }
  return String(color);
}

/**
 * Теги ЗАДАЧ (RoadMap и ToDo): таблицы task_tag и task_tag_applies.
 * Полностью независимы от тегов Канбана (KanbanTagRepository).
 * Одна задача — много тегов; тег принадлежит проекту и применим только к его задачам.
 */
export class TaskTagRepository {
  /** Теги проекта + сколько задач ими помечено */
  static async listByProject(projectId) {
    const res = await pool.query(
      `SELECT tg.id, tg.project_id, tg.name, tg.color_code,
              COUNT(a.task_id)::int AS tasks_count
       FROM task_tag tg
       LEFT JOIN task_tag_applies a ON a.task_tag_id = tg.id
       WHERE tg.project_id = $1
       GROUP BY tg.id
       ORDER BY tg.name;`,
      [projectId]
    );
    return res.rows;
  }

  static async findById(tagId) {
    const res = await pool.query('SELECT * FROM task_tag WHERE id = $1;', [tagId]);
    return res.rows[0];
  }

  static async create(projectId, name, colorCode) {
    const res = await pool.query(
      `INSERT INTO task_tag (project_id, name, color_code)
       VALUES ($1, $2, COALESCE($3, '#808080'))
       RETURNING *;`,
      [projectId, cleanName(name), cleanColor(colorCode)]
    );
    return res.rows[0];
  }

  static async update(tagId, { name, colorCode }) {
    const res = await pool.query(
      `UPDATE task_tag
       SET name = COALESCE($1, name),
           color_code = COALESCE($2, color_code)
       WHERE id = $3
       RETURNING *;`,
      [name === undefined ? null : cleanName(name), cleanColor(colorCode), tagId]
    );
    return res.rows[0];
  }

  /** Удаляет тег; привязки к задачам удаляются каскадом */
  static async remove(tagId) {
    const res = await pool.query('DELETE FROM task_tag WHERE id = $1 RETURNING id;', [tagId]);
    return res.rows[0];
  }

  static async getTaskTags(taskId) {
    const res = await pool.query(
      `SELECT tg.id, tg.project_id, tg.name, tg.color_code
       FROM task_tag_applies a
       JOIN task_tag tg ON tg.id = a.task_tag_id
       WHERE a.task_id = $1
       ORDER BY tg.name;`,
      [taskId]
    );
    return res.rows;
  }

  /** Проверяет, что все теги существуют и относятся к проекту задачи */
  static async #assertTagsBelongToTask(client, taskId, tagIds) {
    const task = await client.query('SELECT project_id FROM task WHERE id = $1;', [taskId]);
    if (task.rows.length === 0) throw new Error('404: Задача не найдена');
    const projectId = task.rows[0].project_id;

    if (tagIds.length > 0) {
      const found = await client.query(
        'SELECT id FROM task_tag WHERE project_id = $1 AND id = ANY($2::bigint[]);',
        [projectId, tagIds]
      );
      if (found.rows.length !== tagIds.length) {
        throw new Error('400: Тег не найден или относится к другому проекту');
      }
    }
    return projectId;
  }

  static #normalizeIds(tagIds) {
    if (!Array.isArray(tagIds)) throw new Error('400: tagIds должен быть массивом');
    const ids = [...new Set(tagIds.map(Number))];
    if (ids.some((id) => !Number.isInteger(id))) throw new Error('400: Некорректный ID тега');
    return ids;
  }

  /** Полностью заменяет набор тегов задачи (атомарно) */
  static async setTaskTags(taskId, tagIds) {
    const ids = this.#normalizeIds(tagIds);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const projectId = await this.#assertTagsBelongToTask(client, taskId, ids);

      await client.query(
        'DELETE FROM task_tag_applies WHERE task_id = $1 AND task_tag_id <> ALL($2::bigint[]);',
        [taskId, ids]
      );
      if (ids.length > 0) {
        await client.query(
          `INSERT INTO task_tag_applies (task_id, task_tag_id, project_id)
           SELECT $1, tag_id, $2 FROM unnest($3::bigint[]) AS tag_id
           ON CONFLICT DO NOTHING;`,
          [taskId, projectId, ids]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getTaskTags(taskId);
  }

  static async applyToTask(taskId, tagId) {
    const id = this.#normalizeIds([tagId])[0];
    const client = await pool.connect();
    try {
      const projectId = await this.#assertTagsBelongToTask(client, taskId, [id]);
      await client.query(
        `INSERT INTO task_tag_applies (task_id, task_tag_id, project_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`,
        [taskId, id, projectId]
      );
    } finally {
      client.release();
    }
    return this.getTaskTags(taskId);
  }

  static async removeFromTask(taskId, tagId) {
    await pool.query('DELETE FROM task_tag_applies WHERE task_id = $1 AND task_tag_id = $2;', [
      taskId,
      tagId,
    ]);
    return this.getTaskTags(taskId);
  }
}
