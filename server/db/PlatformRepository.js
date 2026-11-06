import { pool } from '../config/db.js';

/**
 * Глобальные роли платформы.
 *  ADMIN     — задаётся переменной окружения PLATFORM_ADMIN_EMAILS (список e-mail через запятую), управляет модераторами;
 *              права модератора у него тоже есть.
 *  MODERATOR — выдаётся администратором (таблица platform_roles).
 * Глобальные роли НЕ дают доступа к содержимому проектов.
 */
export class PlatformRepository {
  static adminEmails() {
    return (process.env.PLATFORM_ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  static async getRole(userId) {
    const res = await pool.query(
      `SELECT u.email, pr.role FROM users u LEFT JOIN platform_roles pr ON pr.user_id = u.id WHERE u.id = $1;`,
      [userId]
    );
    const row = res.rows[0];
    if (!row) return null;
    if (this.adminEmails().includes(String(row.email).toLowerCase())) return 'ADMIN';
    return row.role ?? null;
  }

  /** Все пользователи с глобальными ролями: администраторы (из окружения) и модераторы */
  static async listStaff() {
    const admins = this.adminEmails();
    const res = await pool.query(
      `SELECT u.id, u.username, u.email, u.avatar_url, pr.role, pr.granted_at,
              gb.username AS granted_by_name
       FROM users u
       LEFT JOIN platform_roles pr ON pr.user_id = u.id
       LEFT JOIN users gb ON gb.id = pr.granted_by
       WHERE pr.user_id IS NOT NULL OR lower(u.email) = ANY($1::text[])
       ORDER BY u.username;`,
      [admins]
    );
    return res.rows.map((r) => ({ ...r, role: admins.includes(String(r.email).toLowerCase()) ? 'ADMIN' : r.role }));
  }

  /** Получатели уведомлений для модерации: модераторы и администраторы */
  static async staffIds() {
    return (await this.listStaff()).map((r) => r.id);
  }

  static async findUser(identifier) {
    const v = String(identifier ?? '').trim();
    if (!v) throw new Error('400: Укажите e-mail или имя пользователя');
    const res = await pool.query(
      'SELECT id, username, email FROM users WHERE lower(email) = lower($1) OR lower(username) = lower($1) LIMIT 1;',
      [v]
    );
    if (!res.rows[0]) throw new Error('404: Пользователь не найден');
    return res.rows[0];
  }

  static async addModerator(adminId, identifier) {
    const user = await this.findUser(identifier);
    if ((await this.getRole(user.id)) === 'ADMIN') throw new Error('400: Администратор платформы уже обладает правами модератора');
    await pool.query(
      `INSERT INTO platform_roles (user_id, role, granted_by) VALUES ($1, 'MODERATOR', $2)
       ON CONFLICT (user_id) DO NOTHING;`,
      [user.id, adminId]
    );
    await this.log(adminId, 'MODERATOR_ADD', 'user', user.id, user.username, null);
    return user;
  }

  static async removeModerator(adminId, userId) {
    const res = await pool.query(`DELETE FROM platform_roles WHERE user_id = $1 AND role = 'MODERATOR' RETURNING user_id;`, [userId]);
    if (res.rowCount === 0) throw new Error('404: Этот пользователь не модератор');
    const u = await pool.query('SELECT username FROM users WHERE id = $1;', [userId]);
    await this.log(adminId, 'MODERATOR_REMOVE', 'user', userId, u.rows[0]?.username ?? null, null);
  }

  static async getBan(userId) {
    const res = await pool.query(
      `SELECT b.user_id, b.reason, b.banned_at, bb.username AS banned_by_name
       FROM extension_ban b LEFT JOIN users bb ON bb.id = b.banned_by WHERE b.user_id = $1;`,
      [userId]
    );
    return res.rows[0] ?? null;
  }

  /** Запись в журнал модерации (имя исполнителя фиксируется на момент действия) */
  static async log(actorId, action, targetType, targetId, targetName, reason, client = pool) {
    const u = await client.query('SELECT username FROM users WHERE id = $1;', [actorId]);
    await client.query(
      `INSERT INTO moderation_log (actor_id, actor_name, action, target_type, target_id, target_name, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [actorId, u.rows[0]?.username ?? '—', action, targetType, targetId, targetName, reason]
    );
  }

  static async logList(limit = 200) {
    const res = await pool.query('SELECT * FROM moderation_log ORDER BY created_at DESC, id DESC LIMIT $1;', [limit]);
    return res.rows;
  }
}
