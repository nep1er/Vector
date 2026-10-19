import { pool } from '../config/db.js';

const TASK_COLUMNS =
  'id, project_id, type, title, description, start_date, end_date, parent_roadmap_id';

const fmt = (d) => new Date(d).toISOString().slice(0, 10);

export class TaskRepository {
  // =========================================================================
  // ПОИСК
  // =========================================================================

  static async findById(taskId, client = pool) {
    const res = await client.query(`SELECT ${TASK_COLUMNS} FROM task WHERE id = $1;`, [taskId]);
    return res.rows[0];
  }

  /** id корневой RoadMap проекта (в проекте она всегда одна — см. uk_single_main_roadmap_per_project) */
  static async getRootRoadmapId(projectId, client = pool) {
    const res = await client.query(
      'SELECT id FROM task WHERE project_id = $1 AND parent_roadmap_id IS NULL;',
      [projectId]
    );
    return res.rows[0]?.id ?? null;
  }

  // =========================================================================
  // БИЗНЕС-ВАЛИДАТОРЫ (Защита приложения)
  // =========================================================================

  /**
   * 1. Родитель ОБЯЗАН существовать, быть типом 'ROADMAP' и принадлежать тому же проекту
   */
  static async validateParentIsRoadmap(parentRoadmapId, projectId, client = pool) {
    if (!parentRoadmapId) return null; // корневая RoadMap, родителя нет

    const parent = await this.findById(parentRoadmapId, client);

    if (!parent) {
      throw new Error(`404: Указанный родительский этап (ID: ${parentRoadmapId}) не существует`);
    }
    if (parent.type !== 'ROADMAP') {
      throw new Error(
        `400: Недопустимая иерархия. Родителем задачи может быть только ROADMAP (получен type: '${parent.type}')`
      );
    }
    if (projectId != null && parent.project_id !== Number(projectId)) {
      throw new Error('400: Родительский этап относится к другому проекту');
    }
    return parent;
  }

  /**
   * 2. Проверка циклов в иерархии (A → B → C → A)
   */
  static async validateNoCyclicDependency(taskId, newParentId) {
    if (!taskId || !newParentId) return;
    if (Number(taskId) === Number(newParentId)) {
      throw new Error('400: Задача не может быть родителем самой себя');
    }

    const query = `
      WITH RECURSIVE parents AS (
        SELECT id, parent_roadmap_id FROM task WHERE id = $1
        UNION ALL
        SELECT t.id, t.parent_roadmap_id
        FROM task t
        JOIN parents p ON t.id = p.parent_roadmap_id
      )
      SELECT id FROM parents WHERE id = $2;
    `;
    const res = await pool.query(query, [newParentId, taskId]);
    if (res.rows.length > 0) {
      throw new Error('400: Обнаружен цикл в иерархии задач');
    }
  }

  /** 3a. Дата начала не позже даты окончания */
  static validateDateOrder(startDate, endDate) {
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new Error('400: Дата начала не может быть позже даты окончания');
    }
  }

  /** 3b. Временные рамки: даты задачи внутри дат родителя */
  static validateDateInclusion(parentStart, parentEnd, childStart, childEnd) {
    if (childStart && parentStart && new Date(childStart) < new Date(parentStart)) {
      throw new Error(
        `400: Дата начала (${fmt(childStart)}) раньше начала родительского этапа (${fmt(parentStart)})`
      );
    }
    if (childEnd && parentEnd && new Date(childEnd) > new Date(parentEnd)) {
      throw new Error(
        `400: Дата окончания (${fmt(childEnd)}) позже окончания родительского этапа (${fmt(parentEnd)})`
      );
    }
    if (childStart && parentEnd && new Date(childStart) > new Date(parentEnd)) {
      throw new Error('400: Дата начала выходит за границы родительского этапа');
    }
    if (childEnd && parentStart && new Date(childEnd) < new Date(parentStart)) {
      throw new Error('400: Дата окончания выходит за границы родительского этапа');
    }
  }

  // =========================================================================
  // СОЗДАНИЕ
  // =========================================================================

  /**
   * Создаёт запись в supertype `task`.
   * Если parentRoadmapId не указан — задача кладётся в корневую RoadMap проекта
   * (в проекте может быть только одна задача без родителя, это корень).
   */
  static async createBaseTask(
    projectId,
    type,
    title,
    parentRoadmapId = null,
    startDate = null,
    endDate = null,
    client = pool
  ) {
    if (!title || !String(title).trim()) {
      throw new Error('400: Название не может быть пустым');
    }
    projectId = Number(projectId);
    if (!Number.isInteger(projectId)) throw new Error('400: Некорректный ID проекта');

    if (parentRoadmapId == null || parentRoadmapId === '') {
      parentRoadmapId = await this.getRootRoadmapId(projectId, client);
      if (parentRoadmapId == null) {
        throw new Error('404: Корневая RoadMap проекта не найдена (проект не существует?)');
      }
    } else {
      parentRoadmapId = Number(parentRoadmapId);
      if (!Number.isInteger(parentRoadmapId)) throw new Error('400: Некорректный ID родителя');
    }

    const parent = await this.validateParentIsRoadmap(parentRoadmapId, projectId, client);

    this.validateDateOrder(startDate, endDate);
    if (parent) {
      this.validateDateInclusion(parent.start_date, parent.end_date, startDate, endDate);
    }

    // В таблице task нет колонки created_at — не запрашиваем её
    const query = `
      INSERT INTO task (project_id, type, title, parent_roadmap_id, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING ${TASK_COLUMNS};
    `;
    const res = await client.query(query, [
      projectId,
      type,
      String(title).trim(),
      parentRoadmapId,
      startDate || null,
      endDate || null,
    ]);
    return res.rows[0];
  }

  // =========================================================================
  // ЧТЕНИЕ
  // =========================================================================

  /**
   * Дерево задач проекта: массив корней, у каждого узла поле children.
   * Один запрос по проекту + сборка дерева в памяти — быстрее рекурсивного SQL.
   */
  static async getProjectTree(projectId) {
    const res = await pool.query(
      `SELECT ${TASK_COLUMNS}
       FROM task
       WHERE project_id = $1
       ORDER BY start_date NULLS LAST, id;`,
      [projectId]
    );

    const nodes = new Map();
    for (const row of res.rows) nodes.set(row.id, { ...row, children: [] });

    const roots = [];
    for (const node of nodes.values()) {
      const parent = node.parent_roadmap_id != null ? nodes.get(node.parent_roadmap_id) : null;
      (parent ? parent.children : roots).push(node);
    }
    return roots;
  }

  // =========================================================================
  // ИЗМЕНЕНИЕ
  // =========================================================================

  /** Название хранится и в task, и в подтипе — обновляем обе записи атомарно */
  static async updateTaskTitle(taskId, title) {
    if (!title || !String(title).trim()) throw new Error('400: Название не может быть пустым');
    const clean = String(title).trim();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `UPDATE task SET title = $1 WHERE id = $2 RETURNING ${TASK_COLUMNS};`,
        [clean, taskId]
      );
      const task = res.rows[0];
      if (!task) {
        await client.query('ROLLBACK');
        return undefined;
      }
      const table = task.type === 'ROADMAP' ? 'roadmap_task' : 'todo_task';
      await client.query(`UPDATE ${table} SET title = $1 WHERE task_id = $2;`, [clean, taskId]);
      await client.query('COMMIT');
      return task;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateSubtypeTitle(taskId, type, title) {
    if (type !== 'ROADMAP' && type !== 'TODO') {
      throw new Error("400: type должен быть 'ROADMAP' или 'TODO'");
    }
    if (!title || !String(title).trim()) throw new Error('400: Название не может быть пустым');
    const table = type === 'ROADMAP' ? 'roadmap_task' : 'todo_task';
    const res = await pool.query(
      `UPDATE ${table} SET title = $1 WHERE task_id = $2 RETURNING *;`,
      [String(title).trim(), taskId]
    );
    return res.rows[0];
  }

  /** Меняет даты с проверкой: порядок, границы родителя и границы дочерних задач */
  static async updateTaskDates(taskId, startDate, endDate) {
    const task = await this.findById(taskId);
    if (!task) return undefined;

    const newStart = startDate || task.start_date;
    const newEnd = endDate || task.end_date;

    this.validateDateOrder(newStart, newEnd);

    if (task.parent_roadmap_id) {
      const parent = await this.findById(task.parent_roadmap_id);
      this.validateDateInclusion(parent.start_date, parent.end_date, newStart, newEnd);
    }

    if (newStart || newEnd) {
      const out = await pool.query(
        `SELECT id FROM task
         WHERE parent_roadmap_id = $1
           AND (($2::timestamptz IS NOT NULL AND start_date < $2::timestamptz)
             OR ($3::timestamptz IS NOT NULL AND end_date > $3::timestamptz))
         LIMIT 1;`,
        [taskId, newStart, newEnd]
      );
      if (out.rows.length > 0) {
        throw new Error('400: Дочерние задачи выходят за новые границы дат');
      }
    }

    const res = await pool.query(
      `UPDATE task SET start_date = $1, end_date = $2 WHERE id = $3 RETURNING ${TASK_COLUMNS};`,
      [newStart, newEnd, taskId]
    );
    return res.rows[0];
  }

  // =========================================================================
  // УДАЛЕНИЕ
  // =========================================================================

  /** Удаляет задачу вместе с подтипом и всеми дочерними (ON DELETE CASCADE) */
  static async deleteTask(taskId) {
    const task = await this.findById(taskId);
    if (!task) return undefined;
    if (task.parent_roadmap_id == null) {
      throw new Error('400: Корневую RoadMap удалить нельзя — удалите проект целиком');
    }
    const res = await pool.query('DELETE FROM task WHERE id = $1 RETURNING id;', [taskId]);
    return res.rows[0];
  }
}
