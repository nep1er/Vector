import { pool } from '../config/db.js';

// Набор ролей, который создаётся в каждом новом проекте (иерархия из отчёта).
// Права ищутся по имени в справочнике access_rights, поэтому не зависят от id.
const DEFAULT_ROLES = [
  { name: 'Администратор', rights: ['READ', 'WRITE', 'EXECUTE', 'ADMIN'], assignToCreator: true },
  { name: 'Руководитель', rights: ['READ', 'WRITE', 'EXECUTE'] },
  { name: 'Участник', rights: ['READ', 'WRITE'] },
  { name: 'Наблюдатель', rights: ['READ'] },
];

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

      // 1. Проект
      const projRes = await client.query(
        'INSERT INTO project (title, description) VALUES ($1, $2) RETURNING *',
        [title, description]
      );
      const project = projRes.rows[0];

      // 2. Создатель — участник проекта
      const partRes = await client.query(
        'INSERT INTO project_participants (project_id, user_id) VALUES ($1, $2) RETURNING id',
        [project.id, userId]
      );
      const participantId = partRes.rows[0].id;

      // 3. Корневая RoadMap (по бизнес-правилу CTI)
      const rootTitle = `Главный план: ${title}`;
      const taskRes = await client.query(
        `INSERT INTO task (project_id, type, title, parent_roadmap_id)
         VALUES ($1, 'ROADMAP', $2, NULL) RETURNING id`,
        [project.id, rootTitle]
      );
      await client.query(
        'INSERT INTO roadmap_task (task_id, type, title) VALUES ($1, $2, $3)',
        [taskRes.rows[0].id, 'ROADMAP', rootTitle]
      );

      // 4. Стандартные роли с правами; создателю выдаётся роль «Администратор»
      for (const role of DEFAULT_ROLES) {
        const roleRes = await client.query(
          'INSERT INTO project_roles (project_id, name) VALUES ($1, $2) RETURNING id',
          [project.id, role.name]
        );
        const roleId = roleRes.rows[0].id;

        await client.query(
          `INSERT INTO role_access_rights (project_role_id, access_right_id)
           SELECT $1, id FROM access_rights WHERE name = ANY($2::text[])`,
          [roleId, role.rights]
        );

        if (role.assignToCreator) {
          await client.query(
            'INSERT INTO assigned_roles (project_participant_id, project_role_id) VALUES ($1, $2)',
            [participantId, roleId]
          );
        }
      }

      await client.query('COMMIT');
      return { ...project, participant_id: participantId };
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

  static async removeParticipant(projectId, userId) {
    const query = `
      DELETE FROM project_participants
      WHERE project_id = $1 AND user_id = $2
      RETURNING id;
    `;
    const res = await pool.query(query, [projectId, userId]);
    return res.rows[0];
  }

  static async addParticipant(projectId, userId) {
    const query = `
      INSERT INTO project_participants (project_id, user_id)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const res = await pool.query(query, [projectId, userId]);
    return res.rows[0];
  }

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
