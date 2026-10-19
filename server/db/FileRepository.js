import { pool } from '../config/db.js';

// В таблице kanban_card_files есть только: id, kanban_card_id, file_path, uploaded_at
export class FileRepository {
  static async getCardFiles(cardId) {
    const res = await pool.query(
      'SELECT * FROM kanban_card_files WHERE kanban_card_id = $1 ORDER BY uploaded_at',
      [cardId]
    );
    return res.rows;
  }

  static async addFileToCard(cardId, filePath) {
    const query = `
      INSERT INTO kanban_card_files (kanban_card_id, file_path)
      VALUES ($1, $2)
      RETURNING *;
    `;
    const res = await pool.query(query, [cardId, filePath]);
    return res.rows[0];
  }

  static async deleteFile(fileId) {
    const res = await pool.query(
      'DELETE FROM kanban_card_files WHERE id = $1 RETURNING id',
      [fileId]
    );
    return res.rows[0];
  }
}
