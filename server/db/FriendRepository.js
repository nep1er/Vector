import { pool } from '../config/db.js';
import { NotificationRepository } from './NotificationRepository.js';
import { UserRepository } from './UserRepository.js';

/**
 * Друзья (таблицы friends + справочник friend_status: PENDING / ACCEPTED).
 * Одна строка на пару пользователей. Отклонение заявки, отмена и удаление из друзей —
 * просто DELETE строки (статуса REJECTED нет).
 */
export class FriendRepository {
  /** Друзья и заявки пользователя; direction: INCOMING — мне прислали, OUTGOING — я отправил */
  static async listForUser(userId) {
    const res = await pool.query(
      `SELECT f.id, fs.name AS status, f.created_at, f.accepted_at,
              CASE WHEN f.requester_id = $1 THEN 'OUTGOING' ELSE 'INCOMING' END AS direction,
              u.id AS user_id, u.username, u.email, u.avatar_url
       FROM friends f
       JOIN friend_status fs ON fs.id = f.friend_status_id
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE f.requester_id = $1 OR f.addressee_id = $1
       ORDER BY fs.name, u.username;`,
      [userId]
    );
    return res.rows;
  }

  /** Отправляет заявку (по userId, email или имени пользователя) и уведомляет адресата */
  static async sendRequest(requester, { userId, identifier }) {
    let target;
    if (userId != null) {
      target = await UserRepository.findById(Number(userId));
    } else {
      target = await UserRepository.findByIdentifier(identifier);
    }
    if (!target) throw new Error('404: Пользователь не найден');
    if (target.id === requester.id) throw new Error('400: Нельзя добавить в друзья самого себя');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Статус по умолчанию — PENDING; уникальность пары (в любом направлении) держит uk_friends_pair
      const ins = await client.query(
        `INSERT INTO friends (requester_id, addressee_id) VALUES ($1, $2) RETURNING id;`,
        [requester.id, target.id]
      );
      const friendId = ins.rows[0].id;

      await NotificationRepository.create(
        target.id,
        'FRIEND_REQUEST',
        { friend_id: friendId, from_user_id: requester.id, from_username: requester.username },
        client
      );
      await client.query('COMMIT');
      return { id: friendId, user_id: target.id, username: target.username, status: 'PENDING' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Принять заявку может только адресат */
  static async accept(friendId, user) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `UPDATE friends
         SET friend_status_id = (SELECT id FROM friend_status WHERE name = 'ACCEPTED'),
             accepted_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND addressee_id = $2
           AND friend_status_id = (SELECT id FROM friend_status WHERE name = 'PENDING')
         RETURNING id, requester_id;`,
        [friendId, user.id]
      );
      const row = res.rows[0];
      if (!row) {
        await client.query('ROLLBACK');
        return undefined;
      }

      await client.query(
        `UPDATE notifications SET is_read = true, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
         WHERE user_id = $1 AND type = 'FRIEND_REQUEST' AND payload->>'friend_id' = $2::text;`,
        [user.id, String(friendId)]
      );
      await NotificationRepository.create(
        row.requester_id,
        'FRIEND_ACCEPTED',
        { friend_id: friendId, user_id: user.id, username: user.username },
        client
      );
      await client.query('COMMIT');
      return { id: row.id, status: 'ACCEPTED' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Отклонить заявку / отозвать свою / убрать из друзей — удаление строки любым из двух пользователей */
  static async remove(friendId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `DELETE FROM friends
         WHERE id = $1 AND (requester_id = $2 OR addressee_id = $2)
         RETURNING id;`,
        [friendId, userId]
      );
      if (res.rows.length > 0) {
        await client.query(
          `DELETE FROM notifications
           WHERE type = 'FRIEND_REQUEST' AND payload->>'friend_id' = $1::text;`,
          [String(friendId)]
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
}
