import { pool } from '../config/db.js';
import { NotificationRepository } from './NotificationRepository.js';

const COMMENT_SELECT = `
  SELECT cc.id, cc.kanban_card_id, cc.content, cc.created_at, cc.updated_at,
         cc.author_id, u.username AS author_name, u.avatar_url AS author_avatar_url
  FROM card_comments cc
  LEFT JOIN users u ON u.id = cc.author_id`;

function cleanContent(content) {
  const clean = String(content ?? '').trim();
  if (!clean) throw new Error('400: Комментарий не может быть пустым');
  if (clean.length > 5000) throw new Error('400: Комментарий — не длиннее 5000 символов');
  return clean;
}

/** Комментарии к карточкам Канбана (таблица card_comments) */
export class CommentRepository {
  static async listByCard(cardId) {
    const res = await pool.query(`${COMMENT_SELECT} WHERE cc.kanban_card_id = $1 ORDER BY cc.created_at, cc.id;`, [
      cardId,
    ]);
    return res.rows;
  }

  static async findById(commentId) {
    const res = await pool.query(`${COMMENT_SELECT} WHERE cc.id = $1;`, [commentId]);
    return res.rows[0];
  }

  /**
   * Добавляет комментарий и уведомляет участников карточки (кроме автора) —
   * одной транзакцией, чтобы уведомления не оставались без комментария.
   */
  static async create(cardId, authorId, content) {
    const text = cleanContent(content);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const ins = await client.query(
        `INSERT INTO card_comments (kanban_card_id, author_id, content)
         VALUES ($1, $2, $3) RETURNING id;`,
        [cardId, authorId, text]
      );
      const commentId = ins.rows[0].id;

      const ctx = await client.query(
        `SELECT c.title AS card_title, t.project_id, t.id AS todo_id, u.username AS author_name
         FROM kanban_card c
         JOIN kanban_column col ON col.id = c.kanban_column_id
         JOIN task t ON t.id = col.todo_task_id
         JOIN users u ON u.id = $2
         WHERE c.id = $1;`,
        [cardId, authorId]
      );
      const info = ctx.rows[0];

      const recipients = await client.query(
        `SELECT DISTINCT pp.user_id
         FROM card_participants cp
         JOIN project_participants pp ON pp.id = cp.project_participant_id
         WHERE cp.kanban_card_id = $1 AND pp.user_id <> $2;`,
        [cardId, authorId]
      );
      await NotificationRepository.createMany(
        recipients.rows.map((r) => r.user_id),
        'CARD_COMMENT',
        {
          project_id: info.project_id,
          todo_id: info.todo_id,
          card_id: cardId,
          card_title: info.card_title,
          comment_id: commentId,
          author_id: authorId,
          author_name: info.author_name,
        },
        client
      );

      await client.query('COMMIT');
      return this.findById(commentId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async update(commentId, content) {
    const res = await pool.query(
      `UPDATE card_comments SET content = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 RETURNING id;`,
      [cleanContent(content), commentId]
    );
    return res.rows[0] ? this.findById(commentId) : undefined;
  }

  static async remove(commentId) {
    const res = await pool.query('DELETE FROM card_comments WHERE id = $1 RETURNING id;', [commentId]);
    return res.rows[0];
  }
}
