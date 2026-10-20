import { pool } from '../config/db.js';
import { NotificationRepository } from './NotificationRepository.js';
import { OBSERVER_ROLE, ProjectRepository } from './ProjectRepository.js';
import { UserRepository } from './UserRepository.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Приглашения в проект (таблицы project_invitations + справочник invitation_status).
 * Адресат — либо существующий пользователь (invitee_user_id), либо email (invitee_email),
 * ровно одно из двух. Пользователь, принявший приглашение, получает роль «Наблюдатель».
 */
export class InvitationRepository {
  /**
   * Создаёт приглашение и уведомление «PROJECT_INVITATION» для приглашённого.
   * identifier — email или имя пользователя; либо userId.
   */
  static async create(projectId, inviter, { identifier, userId }) {
    let target;
    let email = null;

    if (userId != null) {
      target = await UserRepository.findById(Number(userId));
      if (!target) throw new Error('404: Пользователь не найден');
    } else {
      const value = String(identifier ?? '').trim();
      if (!value) throw new Error('400: Укажите email или имя пользователя');
      target = await UserRepository.findByIdentifier(value);
      if (!target) {
        // Незарегистрированный адресат: приглашение по email увидит тот, кто зарегистрируется с ним
        if (!EMAIL.test(value)) throw new Error('404: Пользователь с таким именем не найден');
        email = value.toLowerCase();
      }
    }

    if (target && target.id === inviter.id) throw new Error('400: Нельзя пригласить самого себя');
    if (target && (await ProjectRepository.isParticipant(projectId, target.id))) {
      throw new Error('409: Пользователь уже участвует в проекте');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ins = await client.query(
        `INSERT INTO project_invitations (project_id, inviter_id, invitee_user_id, invitee_email)
         VALUES ($1, $2, $3, $4)
         RETURNING id;`,
        [projectId, inviter.id, target ? target.id : null, email]
      );
      const invitationId = ins.rows[0].id;

      if (target) {
        const project = await client.query('SELECT title FROM project WHERE id = $1;', [projectId]);
        await NotificationRepository.create(
          target.id,
          'PROJECT_INVITATION',
          {
            invitation_id: invitationId,
            project_id: projectId,
            project_title: project.rows[0]?.title ?? '',
            inviter_id: inviter.id,
            inviter_name: inviter.username,
          },
          client
        );
      }

      await client.query('COMMIT');
      return { id: invitationId, project_id: projectId, invitee: target ? target.username : email };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Ожидающие ответа приглашения проекта (вкладка «Участники» в настройках) */
  static async listPendingForProject(projectId) {
    const res = await pool.query(
      `SELECT inv.id, inv.created_at,
              COALESCE(u.username, inv.invitee_email) AS invitee,
              COALESCE(u.email, inv.invitee_email) AS invitee_email,
              u.avatar_url AS invitee_avatar_url,
              inviter.username AS inviter_name
       FROM project_invitations inv
       LEFT JOIN users u ON u.id = inv.invitee_user_id
       JOIN users inviter ON inviter.id = inv.inviter_id
       WHERE inv.project_id = $1
         AND inv.invitation_status_id = (SELECT id FROM invitation_status WHERE name = 'PENDING')
       ORDER BY inv.created_at DESC;`,
      [projectId]
    );
    return res.rows;
  }

  /** Мои ожидающие приглашения (по id или по email, на который меня пригласили до регистрации) */
  static async listPendingForUser(user) {
    const res = await pool.query(
      `SELECT inv.id, inv.project_id, p.title AS project_title,
              inviter.id AS inviter_id, inviter.username AS inviter_name, inv.created_at
       FROM project_invitations inv
       JOIN project p ON p.id = inv.project_id
       JOIN users inviter ON inviter.id = inv.inviter_id
       WHERE inv.invitation_status_id = (SELECT id FROM invitation_status WHERE name = 'PENDING')
         AND (inv.invitee_user_id = $1 OR LOWER(inv.invitee_email) = LOWER($2))
       ORDER BY inv.created_at DESC;`,
      [user.id, user.email]
    );
    return res.rows;
  }

  /** Руководитель отзывает приглашение; уведомление о нём исчезает у адресата */
  static async cancel(projectId, invitationId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `UPDATE project_invitations
         SET invitation_status_id = (SELECT id FROM invitation_status WHERE name = 'CANCELED'),
             responded_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND project_id = $2
           AND invitation_status_id = (SELECT id FROM invitation_status WHERE name = 'PENDING')
         RETURNING id;`,
        [invitationId, projectId]
      );
      if (res.rows.length > 0) {
        await client.query(
          `DELETE FROM notifications
           WHERE type = 'PROJECT_INVITATION' AND payload->>'invitation_id' = $1::text;`,
          [String(invitationId)]
        );
      }
      await client.query('COMMIT');
      return res.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Принять / отклонить приглашение (только адресат).
   * При принятии пользователь добавляется в проект с ролью «Наблюдатель».
   */
  static async respond(invitationId, user, accept) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const found = await client.query(
        `SELECT inv.*, ist.name AS status
         FROM project_invitations inv
         JOIN invitation_status ist ON ist.id = inv.invitation_status_id
         WHERE inv.id = $1
         FOR UPDATE OF inv;`,
        [invitationId]
      );
      const inv = found.rows[0];
      const isAddressee =
        inv &&
        (inv.invitee_user_id === user.id ||
          (inv.invitee_email && inv.invitee_email.toLowerCase() === String(user.email).toLowerCase()));
      if (!isAddressee) throw new Error('404: Приглашение не найдено');
      if (inv.status !== 'PENDING') throw new Error('409: Приглашение уже обработано');

      if (accept) {
        await ProjectRepository.addParticipantWithRole(inv.project_id, user.id, OBSERVER_ROLE, client);
      }

      // invitee_email обнуляем, а invitee_user_id заполняем: CHECK требует ровно одно из двух
      await client.query(
        `UPDATE project_invitations
         SET invitation_status_id = (SELECT id FROM invitation_status WHERE name = $2),
             responded_at = CURRENT_TIMESTAMP,
             invitee_user_id = $3,
             invitee_email = NULL
         WHERE id = $1;`,
        [invitationId, accept ? 'ACCEPTED' : 'DECLINED', user.id]
      );
      await NotificationRepository.markInvitationRead(user.id, invitationId, client);

      await client.query('COMMIT');
      return { id: invitationId, project_id: inv.project_id, status: accept ? 'ACCEPTED' : 'DECLINED' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
