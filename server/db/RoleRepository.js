import { pool } from '../config/db.js';

export class RoleRepository {
  // 1. Создать роль в проекте
  static async createProjectRole(projectId, name) {
    const query = `
      INSERT INTO project_roles (project_id, name)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const res = await pool.query(query, [projectId, name]);
    return res.rows[0];
  }

  // 2. Привязать право доступа к Роли
  static async addRightToRole(roleId, accessRightId) {
    const query = `
      INSERT INTO role_access_rights (project_role_id, access_right_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING *;
    `;
    const res = await pool.query(query, [roleId, accessRightId]);
    return res.rows[0];
  }

  // 3. Отозвать право доступа у Роли
  static async removeRightFromRole(roleId, accessRightId) {
    const query = `
      DELETE FROM role_access_rights
      WHERE project_role_id = $1 AND access_right_id = $2
      RETURNING *;
    `;
    const res = await pool.query(query, [roleId, accessRightId]);
    return res.rows[0];
  }

  // 4. Назначить Роль Участнику
  static async assignRoleToParticipant(participantId, roleId) {
    const query = `
      INSERT INTO assigned_roles (project_participant_id, project_role_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING *;
    `;
    const res = await pool.query(query, [participantId, roleId]);
    return res.rows[0];
  }

  // 5. Снять Роль с Участника
  static async revokeRoleFromParticipant(participantId, roleId) {
    const query = `
      DELETE FROM assigned_roles
      WHERE project_participant_id = $1 AND project_role_id = $2
      RETURNING *;
    `;
    const res = await pool.query(query, [participantId, roleId]);
    return res.rows[0];
  }

  // 6. Получить все роли проекта
  static async getProjectRoles(projectId) {
    const query = `
      SELECT pr.*,
             json_agg(ar.name) FILTER (WHERE ar.name IS NOT NULL) as rights
      FROM project_roles pr
      LEFT JOIN role_access_rights rar ON pr.id = rar.project_role_id
      LEFT JOIN access_rights ar ON rar.access_right_id = ar.id
      WHERE pr.project_id = $1
      GROUP BY pr.id;
    `;
    const res = await pool.query(query, [projectId]);
    return res.rows;
  }

  // 7. Сменить название роли
  static async updateRoleName(roleId, newName) {
    const query = `UPDATE project_roles SET name = $1 WHERE id = $2 RETURNING *;`;
    const res = await pool.query(query, [newName, roleId]);
    return res.rows[0];
  }

  // 8. Права пользователя в проекте (используется rbacMiddleware).
  // Объединяет права всех ролей, назначенных участнику. Не участник — пустой массив.
  static async getUserPermissionsInProject(userId, projectId) {
    const query = `
      SELECT DISTINCT ar.name
      FROM project_participants pp
      JOIN assigned_roles asr ON asr.project_participant_id = pp.id
      JOIN role_access_rights rar ON rar.project_role_id = asr.project_role_id
      JOIN access_rights ar ON ar.id = rar.access_right_id
      WHERE pp.user_id = $1 AND pp.project_id = $2;
    `;
    const res = await pool.query(query, [userId, projectId]);
    return res.rows.map((row) => row.name);
  }
}
