import { pool } from '../config/db.js';
import { TaskRepository } from './TaskRepository.js';

export class TodoRepository {
  /**
   * Создаёт ToDo-задачу + 3 стандартные колонки канбана в одной транзакции.
   * Если parentRoadmapId не передан — задача попадёт в корневую RoadMap проекта.
   */
  static async createTodoTask(projectId, title, parentRoadmapId = null) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Базовая запись в task (client — ШЕСТЫМ аргументом, после дат)
      const baseTask = await TaskRepository.createBaseTask(
        projectId,
        'TODO',
        title,
        parentRoadmapId,
        null, // startDate
        null, // endDate
        client
      );

      // 2. Дочерняя часть в todo_task
      const subRes = await client.query(
        `INSERT INTO todo_task (task_id, type, title)
         VALUES ($1, 'TODO', $2)
         RETURNING task_id;`,
        [baseTask.id, baseTask.title]
      );

      // 3. Дефолтные колонки канбана
      const defaultColumns = ['К выполнению', 'В работе', 'Готово'];
      for (let i = 0; i < defaultColumns.length; i++) {
        await client.query(
          'INSERT INTO kanban_column (todo_task_id, title, position) VALUES ($1, $2, $3)',
          [baseTask.id, defaultColumns[i], i + 1]
        );
      }

      await client.query('COMMIT');
      return { ...baseTask, ...subRes.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
