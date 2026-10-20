import { pool } from '../config/db.js';

/**
 * Уведомления пользователей (таблица notifications).
 * type — значение из справочника notification_type, payload — JSON-контекст события.
 *
 * Типы и поля payload:
 *   PROJECT_INVITATION  { invitation_id, project_id, project_title, inviter_id, inviter_name }
 *   CARD_COMMENT        { project_id, card_id, card_title, comment_id, author_id, author_name }
 *   TASK_STATUS_CHANGED { project_id, task_id, task_title, status_id, status_name, actor_id, actor_name }
 *   FRIEND_REQUEST      { friend_id, from_user_id, from_username }
 *   FRIEND_ACCEPTED     { friend_id, user_id, username }
 */
export class NotificationRepository {
  static async create(userId, type, payload = {}, client = pool) {
    const res = await client.query(
      `INSERT INTO notifications (user_id, type, payload)
       VALUES ($1, $2, $3::jsonb)
       RETURNING *;`,
      [userId, type, JSON.stringify(payload)]
    );
    return res.rows[0];
  }

  /** Одно и то же уведомление нескольким получателям (одним запросом) */
  static async createMany(userIds, type, payload = {}, client = pool) {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return [];
    const res = await client.query(
      `INSERT INTO notifications (user_id, type, payload)
       SELECT uid, $2, $3::jsonb FROM unnest($1::bigint[]) AS uid
       RETURNING *;`,
      [ids, type, JSON.stringify(payload)]
    );
    return res.rows;
  }

  /**
   * Список уведомлений пользователя, новые сверху.
   * Для приглашений добавляет актуальный статус приглашения (чтобы показать «Принять/Отклонить»
   * только пока оно не обработано).
   */
  static async listForUser(userId, { unreadOnly = false, limit = 50, offset = 0 } = {}) {
    const res = await pool.query(
      `SELECT n.id, n.type, n.payload, n.is_read, n.created_at, n.read_at,
              inv.invitation_status_id AS invitation_status_id,
              ist.name AS invitation_status
       FROM notifications n
       LEFT JOIN project_invitations inv
              ON inv.id = CASE WHEN n.type = 'PROJECT_INVITATION'
                               THEN (n.payload->>'invitation_id')::bigint END
       LEFT JOIN invitation_status ist ON ist.id = inv.invitation_status_id
       WHERE n.user_id = $1 AND (NOT $2::boolean OR NOT n.is_read)
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $3 OFFSET $4;`,
      [userId, unreadOnly, limit, offset]
    );
    return res.rows;
  }

  static async countUnread(userId) {
    const res = await pool.query(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND NOT is_read;',
      [userId]
    );
    return res.rows[0].count;
  }

  static async markRead(notificationId, userId) {
    const res = await pool.query(
      `UPDATE notifications SET is_read = true, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE id = $1 AND user_id = $2
       RETURNING *;`,
      [notificationId, userId]
    );
    return res.rows[0];
  }

  static async markAllRead(userId) {
    const res = await pool.query(
      `UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND NOT is_read;`,
      [userId]
    );
    return res.rowCount;
  }

  /** Прочитать все уведомления о конкретном приглашении (после «Принять/Отклонить») */
  static async markInvitationRead(userId, invitationId, client = pool) {
    await client.query(
      `UPDATE notifications SET is_read = true, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
       WHERE user_id = $1 AND type = 'PROJECT_INVITATION' AND payload->>'invitation_id' = $2::text;`,
      [userId, invitationId]
    );
  }

  static async remove(notificationId, userId) {
    const res = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id;',
      [notificationId, userId]
    );
    return res.rows[0];
  }
}
