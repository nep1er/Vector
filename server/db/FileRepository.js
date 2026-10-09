import { pool } from '../config/db.js';

export class FileRepository {
  static async getCardFiles(cardId) {
    const res = await pool.query(
      'SELECT * FROM kanban_card_files WHERE kanban_card_id = $1',
      [cardId]
    );
    return res.rows;
  }

  static async addFileToCard(cardId, fileUrl, fileName) {
    const query = `
      INSERT INTO kanban_card_files (kanban_card_id, file_url, file_name)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await pool.query(query, [cardId, fileUrl, fileName]);
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