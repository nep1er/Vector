import { pool } from '../config/db.js';

export class ProjectRepository {
  static async findById(projectId) {
    const res = await pool.query('SELECT * FROM project WHERE id = $1', [projectId]);
    return res.rows[0];
  }

  static async getUserProjects(userId) {
    const query = `
      SELECT p.*, pp.id as participant_id
      FROM project p
      JOIN project_participants pp ON p.id = pp.project_id
      WHERE pp.user_id = $1
      ORDER BY p.created_at DESC;
    `;
    const res = await pool.query(query, [userId]);
    return res.rows;
  }

  static async createProject(title, description, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Создаем проект
      const projRes = await client.query(
        'INSERT INTO project (title, description) VALUES ($1, $2) RETURNING *',
        [title, description]
      );
      const project = projRes.rows[0];

      // 2. Добавляем создателя в участники
      const partRes = await client.query(
        'INSERT INTO project_participants (project_id, user_id) VALUES ($1, $2) RETURNING id',
        [project.id, userId]
      );

      // 3. Создаем Корневую RoadMap (по бизнес-правилу CTI)
      const taskRes = await client.query(
        `INSERT INTO task (project_id, type, title, parent_roadmap_id) 
         VALUES ($1, 'ROADMAP', $2, NULL) RETURNING id`,
        [project.id, `Главный план: ${title}`]
      );

      await client.query(
        'INSERT INTO roadmap_task (task_id, type, title) VALUES ($1, $2, $3)',
        [taskRes.rows[0].id, 'ROADMAP', `Главный план: ${title}`]
      );

      await client.query('COMMIT');
      return project;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async deleteProject(projectId) {
    const res = await pool.query('DELETE FROM project WHERE id = $1 RETURNING id', [projectId]);
    return res.rows[0];
  }

  // Добавить в класс ProjectRepository:
    static async removeParticipant(projectId, userId) {
    const query = `
        DELETE FROM project_participants 
        WHERE project_id = $1 AND user_id = $2 
        RETURNING id;
    `;
    const res = await pool.query(query, [projectId, userId]);
    return res.rows[0];
    }

    // Добавить метод в ProjectRepository:
static async addParticipant(projectId, userId) {
  const query = `
    INSERT INTO project_participants (project_id, user_id)
    VALUES ($1, $2)
    RETURNING *;
  `;
  const res = await pool.query(query, [projectId, userId]);
  return res.rows[0];
}

// Добавить в ProjectRepository:
static async updateProjectDetails(projectId, title, description) {
  const query = `
    UPDATE project 
    SET title = COALESCE($1, title), 
        description = COALESCE($2, description)
    WHERE id = $3 
    RETURNING *;
  `;
  const res = await pool.query(query, [title, description, projectId]);
  return res.rows[0];
}
}