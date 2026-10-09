import { pool } from '../config/db.js';

export class TaskRepository {
  
  // =========================================================================
  // БИЗНЕС-ВАЛИДАТОРЫ (Защита приложения)
  // =========================================================================

  /**
   * 1. Проверка типа родителя: Родитель ОБЯЗАН быть типом 'ROADMAP'
   */
  static async validateParentIsRoadmap(parentRoadmapId) {
    if (!parentRoadmapId) return; // Если это корневая RoadMap, родителя нет

    const query = `SELECT id, type, start_date, end_date FROM task WHERE id = $1;`;
    const res = await pool.query(query, [parentRoadmapId]);
    const parent = res.rows[0];

    if (!parent) {
      throw new Error(`400: Указанный родительский этап (ID: ${parentRoadmapId}) не существует`);
    }

    if (parent.type !== 'ROADMAP') {
      throw new Error(`400: Недопустимая иерархия. Родителем задачи может быть только ROADMAP (получен type: '${parent.type}')`);
    }

    return parent;
  }

  /**
   * 2. Проверка циклов в иерархии ($A \to B \to C \to A$)
   */
  static async validateNoCyclicDependency(taskId, newParentId) {
    if (!taskId || !newParentId) return;
    if (taskId === newParentId) {
      throw new Error('400: Задача не может быть родителем самой себя');
    }

    // Рекурсивный запрос вверх по дереву
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
      throw new Error('400: Обнаружен циклический импорт в иерархии задач');
    }
  }

  /**
   * 3. Проверка временных рамок (Child dates $\subseteq$ Parent dates)
   */
  static validateDateInclusion(parentStartDate, parentEndDate, childStartDate, childEndDate) {
    if (!childStartDate || !childEndDate) return;

    if (parentStartDate && new Date(childStartDate) < new Date(parentStartDate)) {
      throw new Error(`400: Дата начала задачи (${childStartDate}) выходит за границы начала родительского этапа (${parentStartDate})`);
    }

    if (parentEndDate && new Date(childEndDate) > new Date(parentEndDate)) {
      throw new Error(`400: Дата окончания задачи (${childEndDate}) выходит за границы окончания родительского этапа (${parentEndDate})`);
    }
  }


  static async createBaseTask(projectId, type, title, parentRoadmapId = null, startDate = null, endDate = null, client = pool) {
    // 1. Проверяем тип родителя перед вставкой
    const parent = await this.validateParentIsRoadmap(parentRoadmapId);

    // 2. Если есть даты, проверяем вхождение в интервал родителя
    if (parent && (startDate || endDate)) {
      this.validateDateInclusion(parent.start_date, parent.end_date, startDate, endDate);
    }

    const query = `
      INSERT INTO task (project_id, type, title, parent_roadmap_id, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, project_id, type, title, parent_roadmap_id, start_date, end_date, created_at;
    `;
    const res = await client.query(query, [projectId, type, title, parentRoadmapId, startDate, endDate]);
    return res.rows[0];
  }

  // Добавить в TaskRepository:
static async updateTaskTitle(taskId, title) {
  const query = `
    UPDATE task SET title = $1 WHERE id = $2 RETURNING *;
  `;
  const res = await pool.query(query, [title, taskId]);
  return res.rows[0];
}

static async updateSubtypeTitle(taskId, type, title) {
  const table = type === 'ROADMAP' ? 'roadmap_task' : 'todo_task';
  const query = `
    UPDATE ${table} SET title = $1 WHERE task_id = $2 RETURNING *;
  `;
  const res = await pool.query(query, [title, taskId]);
  return res.rows[0];
}

// Добавить в TaskRepository:
static async updateTaskDates(taskId, startDate, endDate) {
  const query = `
    UPDATE task 
    SET start_date = COALESCE($1, start_date), 
        end_date = COALESCE($2, end_date)
    WHERE id = $3 RETURNING *;
  `;
  const res = await pool.query(query, [startDate, endDate, taskId]);
  return res.rows[0];
}
}