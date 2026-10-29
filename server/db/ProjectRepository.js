import { pool } from '../config/db.js';
import { removeProjectDir } from '../utils/fileStore.js';
import { RoleRepository } from './RoleRepository.js';

// Набор ролей, который создаётся в каждом новом проекте (иерархия из отчёта).
// Права ищутся по имени в справочнике access_rights, поэтому не зависят от id.
export const OBSERVER_ROLE = 'Наблюдатель'; // роль, которую получает принявший приглашение

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
    if (res.rows[0]) await removeProjectDir(projectId); // файлы вложений и хранилища
    return res.rows[0];
  }

  /** Участники проекта с их ролями (для вкладки «Участники» и панели аватарок) */
  static async getParticipants(projectId) {
    const res = await pool.query(
      `SELECT pp.id AS participant_id, u.id AS user_id, u.username, u.email, u.avatar_url,
              COALESCE(
                json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.id)
                  FILTER (WHERE r.id IS NOT NULL),
                '[]'::json
              ) AS roles
       FROM project_participants pp
       JOIN users u ON u.id = pp.user_id
       LEFT JOIN assigned_roles ar ON ar.project_participant_id = pp.id
       LEFT JOIN project_roles r ON r.id = ar.project_role_id
       WHERE pp.project_id = $1
       GROUP BY pp.id, u.id
       ORDER BY pp.id;`,
      [projectId]
    );
    return res.rows;
  }

  /** Находит роль проекта по имени; если её нет (старые проекты) — создаёт со стандартными правами */
  static async ensureRole(projectId, roleName, client = pool) {
    const found = await client.query(
      'SELECT id FROM project_roles WHERE project_id = $1 AND name = $2;',
      [projectId, roleName]
    );
    if (found.rows[0]) return found.rows[0].id;

    const def = DEFAULT_ROLES.find((r) => r.name === roleName);
    const created = await client.query(
      'INSERT INTO project_roles (project_id, name) VALUES ($1, $2) RETURNING id;',
      [projectId, roleName]
    );
    const roleId = created.rows[0].id;
    await client.query(
      `INSERT INTO role_access_rights (project_role_id, access_right_id)
       SELECT $1, id FROM access_rights WHERE name = ANY($2::text[]);`,
      [roleId, def ? def.rights : ['READ']]
    );
    return roleId;
  }

  /**
   * Добавляет пользователя в проект с ролью (по умолчанию «Наблюдатель»).
   * Если он уже участник — ничего не меняет и возвращает created: false.
   */
  static async addParticipantWithRole(projectId, userId, roleName = OBSERVER_ROLE, client = pool) {
    const ins = await client.query(
      `INSERT INTO project_participants (project_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (project_id, user_id) DO NOTHING
       RETURNING *;`,
      [projectId, userId]
    );
    if (!ins.rows[0]) {
      const existing = await client.query(
        'SELECT * FROM project_participants WHERE project_id = $1 AND user_id = $2;',
        [projectId, userId]
      );
      return { ...existing.rows[0], created: false };
    }

    const roleId = await this.ensureRole(projectId, roleName, client);
    await client.query(
      'INSERT INTO assigned_roles (project_participant_id, project_role_id) VALUES ($1, $2);',
      [ins.rows[0].id, roleId]
    );
    return { ...ins.rows[0], created: true };
  }

  static async isParticipant(projectId, userId, client = pool) {
    const res = await client.query(
      'SELECT 1 FROM project_participants WHERE project_id = $1 AND user_id = $2;',
      [projectId, userId]
    );
    return res.rows.length > 0;
  }

  /** Исключает участника. Последнего администратора проекта исключить нельзя. */
  static async removeParticipant(projectId, userId) {
    const found = await pool.query(
      'SELECT id FROM project_participants WHERE project_id = $1 AND user_id = $2;',
      [projectId, userId]
    );
    const participantId = found.rows[0]?.id;
    if (!participantId) return undefined;

    const admins = await RoleRepository.adminParticipantIds(projectId);
    if (admins.has(participantId) && admins.size === 1) {
      throw new Error('400: Нельзя исключить последнего администратора проекта');
    }

    const res = await pool.query('DELETE FROM project_participants WHERE id = $1 RETURNING id;', [
      participantId,
    ]);
    return res.rows[0];
  }

  /** Прямое добавление (без приглашения) — участник получает роль «Наблюдатель» */
  static async addParticipant(projectId, userId) {
    const participant = await this.addParticipantWithRole(projectId, userId, OBSERVER_ROLE);
    if (!participant.created) {
      const err = new Error('409: Пользователь уже участвует в проекте');
      throw err;
    }
    return participant;
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
