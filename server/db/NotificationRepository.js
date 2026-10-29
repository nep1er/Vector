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
   * Категория уведомления: ROADMAP (изменения на доске), TODO, CARD (карточки), INVITES (приглашения).
   * Уведомления приходят всегда; категории, отмеченные пользователем скрытыми, попадают во вкладку «Скрытые».
   */
  static CATEGORY_SQL = `CASE n.type
      WHEN 'TASK_STATUS_CHANGED' THEN CASE WHEN t.type = 'TODO' THEN 'TODO' ELSE 'ROADMAP' END
      WHEN 'CARD_COMMENT' THEN 'CARD'
      ELSE 'INVITES' END`;

  static CATEGORIES = ['INVITES', 'ROADMAP', 'TODO', 'CARD'];

  static BASE = `
    FROM notifications n
    LEFT JOIN task t ON t.id = CASE WHEN n.type = 'TASK_STATUS_CHANGED' THEN (n.payload->>'task_id')::bigint END
    LEFT JOIN notification_settings s ON s.user_id = n.user_id AND s.category = (${NotificationRepository.CATEGORY_SQL})`;

  /**
   * Список уведомлений пользователя, новые сверху. folder: main (по умолчанию) | hidden | all.
   * Для приглашений добавляет актуальный статус (invitation_status), для заявок в друзья — friend_state
   * (PENDING / ACCEPTED / GONE), чтобы «Принять/Отклонить» показывались только пока заявка не обработана.
   */
  static async listForUser(userId, { unreadOnly = false, limit = 50, offset = 0, folder = 'main' } = {}) {
    const res = await pool.query(
      `SELECT n.id, n.type, n.payload, n.is_read, n.created_at, n.read_at,
              ${NotificationRepository.CATEGORY_SQL} AS category,
              COALESCE(s.hidden, false) AS hidden,
              inv.invitation_status_id AS invitation_status_id,
              ist.name AS invitation_status,
              CASE WHEN n.type = 'FRIEND_REQUEST' THEN COALESCE(fs.name, 'GONE') END AS friend_state
       ${NotificationRepository.BASE}
       LEFT JOIN project_invitations inv
              ON inv.id = CASE WHEN n.type = 'PROJECT_INVITATION'
                               THEN (n.payload->>'invitation_id')::bigint END
       LEFT JOIN invitation_status ist ON ist.id = inv.invitation_status_id
       LEFT JOIN friends f ON f.id = CASE WHEN n.type = 'FRIEND_REQUEST' THEN (n.payload->>'friend_id')::bigint END
       LEFT JOIN friend_status fs ON fs.id = f.friend_status_id
       WHERE n.user_id = $1 AND (NOT $2::boolean OR NOT n.is_read)
         AND ($5 = 'all' OR ($5 = 'hidden') = COALESCE(s.hidden, false))
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT $3 OFFSET $4;`,
      [userId, unreadOnly, limit, offset, folder]
    );
    return res.rows;
  }

  /** Непрочитанные: count — только видимые (значок на колокольчике), hidden — в скрытых */
  static async countUnread(userId) {
    const res = await pool.query(
      `SELECT COUNT(*) FILTER (WHERE NOT COALESCE(s.hidden, false))::int AS count,
              COUNT(*) FILTER (WHERE COALESCE(s.hidden, false))::int AS hidden
       ${NotificationRepository.BASE}
       WHERE n.user_id = $1 AND NOT n.is_read;`,
      [userId]
    );
    return res.rows[0];
  }

  static async getSettings(userId) {
    const res = await pool.query('SELECT category, hidden FROM notification_settings WHERE user_id = $1;', [userId]);
    const hidden = new Map(res.rows.map((r) => [r.category, r.hidden]));
    return NotificationRepository.CATEGORIES.map((category) => ({ category, hidden: hidden.get(category) ?? false }));
  }

  /** settings: { INVITES: false, ROADMAP: true, ... } — true = убрать в «Скрытые» */
  static async setSettings(userId, settings) {
    for (const [category, hidden] of Object.entries(settings ?? {})) {
      if (!NotificationRepository.CATEGORIES.includes(category) || typeof hidden !== 'boolean') {
        throw new Error('400: Некорректные настройки уведомлений');
      }
      await pool.query(
        `INSERT INTO notification_settings (user_id, category, hidden) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, category) DO UPDATE SET hidden = EXCLUDED.hidden;`,
        [userId, category, hidden]
      );
    }
    return this.getSettings(userId);
  }

  /** Прочитать все видимые (скрытые не трогаем, если folder = main) */
  static async markAllReadIn(userId, folder = 'main') {
    const res = await pool.query(
      `UPDATE notifications SET is_read = true, read_at = CURRENT_TIMESTAMP
       WHERE id IN (SELECT n.id ${NotificationRepository.BASE}
                    WHERE n.user_id = $1 AND NOT n.is_read
                      AND ($2 = 'all' OR ($2 = 'hidden') = COALESCE(s.hidden, false)));`,
      [userId, folder]
    );
    return res.rowCount;
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
