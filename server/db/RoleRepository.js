import { pool } from '../config/db.js';

export class RoleRepository {
  // 1. Создать роль в проекте
  static async createProjectRole(projectId, name) {
    const res = await pool.query(
      `INSERT INTO project_roles (project_id, name)
       VALUES ($1, $2)
       RETURNING *;`,
      [projectId, this.cleanRoleName(name)]
    );
    return { ...res.rows[0], rights: null };
  }

  static cleanRoleName(name) {
    const clean = String(name ?? '').trim();
    if (!clean) throw new Error('400: Название роли обязательно');
    if (clean.length > 50) throw new Error('400: Название роли — не длиннее 50 символов');
    return clean;
  }

  /** true, если участник относится к проекту */
  static async participantBelongsToProject(projectId, participantId) {
    const res = await pool.query(
      'SELECT 1 FROM project_participants WHERE id = $1 AND project_id = $2;',
      [participantId, projectId]
    );
    return res.rows.length > 0;
  }

  static async findById(roleId) {
    const res = await pool.query('SELECT * FROM project_roles WHERE id = $1;', [roleId]);
    return res.rows[0];
  }

  /** Справочник прав доступа (READ, WRITE, EXECUTE, ADMIN) */
  static async getAccessRights() {
    const res = await pool.query('SELECT id, name FROM access_rights ORDER BY id;');
    return res.rows;
  }

  /**
   * id участников проекта, у которых есть право ADMIN.
   * exceptRoleId — не считать права, которые даёт эта роль (проверка «останется ли админ»).
   */
  static async adminParticipantIds(projectId, { exceptRoleId = null } = {}, client = pool) {
    const res = await client.query(
      `SELECT DISTINCT ar.project_participant_id AS id
       FROM assigned_roles ar
       JOIN project_roles r ON r.id = ar.project_role_id
       JOIN role_access_rights rar ON rar.project_role_id = r.id
       JOIN access_rights a ON a.id = rar.access_right_id
       WHERE r.project_id = $1 AND a.name = 'ADMIN'
         AND ($2::int IS NULL OR r.id <> $2);`,
      [projectId, exceptRoleId]
    );
    return new Set(res.rows.map((row) => row.id));
  }

  /** Бросает 400, если без роли roleId в проекте не останется ни одного администратора */
  static async assertAdminSurvivesWithout(roleId, client = pool) {
    const role = await this.findById(roleId);
    if (!role) return;
    const before = await this.adminParticipantIds(role.project_id, {}, client);
    const after = await this.adminParticipantIds(role.project_id, { exceptRoleId: roleId }, client);
    if (before.size > 0 && after.size === 0) {
      throw new Error('400: В проекте должен остаться хотя бы один администратор');
    }
  }

  /** Удаляет роль (назначения и права удаляются каскадом) */
  static async deleteRole(roleId) {
    await this.assertAdminSurvivesWithout(roleId);
    const res = await pool.query('DELETE FROM project_roles WHERE id = $1 RETURNING id;', [roleId]);
    return res.rows[0];
  }

  /**
   * Делает роль единственной ролью участника («смена роли» в настройках).
   * Роль и участник должны принадлежать одному проекту; последнего админа разжаловать нельзя.
   */
  static async setParticipantRole(projectId, participantId, roleId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const check = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM project_participants WHERE id = $1 AND project_id = $3) AS participant_ok,
           EXISTS (SELECT 1 FROM project_roles WHERE id = $2 AND project_id = $3) AS role_ok;`,
        [participantId, roleId, projectId]
      );
      if (!check.rows[0].participant_ok) throw new Error('404: Участник не найден в проекте');
      if (!check.rows[0].role_ok) throw new Error('404: Роль не найдена в проекте');

      const admins = await this.adminParticipantIds(projectId, {}, client);
      const grants = await client.query(
        `SELECT 1 FROM role_access_rights rar JOIN access_rights a ON a.id = rar.access_right_id
         WHERE rar.project_role_id = $1 AND a.name = 'ADMIN';`,
        [roleId]
      );
      const after = new Set(admins);
      after.delete(participantId);
      if (grants.rows.length > 0) after.add(participantId);
      if (admins.size > 0 && after.size === 0) {
        throw new Error('400: Нельзя снять права у последнего администратора проекта');
      }

      await client.query('DELETE FROM assigned_roles WHERE project_participant_id = $1;', [participantId]);
      await client.query(
        'INSERT INTO assigned_roles (project_participant_id, project_role_id) VALUES ($1, $2);',
        [participantId, roleId]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
    const right = await pool.query('SELECT name FROM access_rights WHERE id = $1;', [accessRightId]);
    if (right.rows[0]?.name === 'ADMIN') await this.assertAdminSurvivesWithout(roleId);
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
    const res = await pool.query(query, [this.cleanRoleName(newName), roleId]);
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
