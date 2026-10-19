import { pool } from '../config/db.js';

export class TagRepository {
  static async getProjectTags(projectId) {
    const res = await pool.query(
      'SELECT * FROM project_tag WHERE project_id = $1 ORDER BY name',
      [projectId]
    );
    return res.rows;
  }

  // В БД колонка называется color_code (а не color)
  static async createTag(projectId, name, colorCode) {
    const query = `
      INSERT INTO project_tag (project_id, name, color_code)
      VALUES ($1, $2, $3)
      RETURNING *;
    `;
    const res = await pool.query(query, [projectId, name, colorCode]);
    return res.rows[0];
  }

  static async applyTagToCard(cardId, tagId) {
    const query = `
      INSERT INTO tags_applies (kanban_card_id, project_tag_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING *;
    `;
    const res = await pool.query(query, [cardId, tagId]);
    return res.rows[0];
  }

  static async removeTagFromCard(cardId, tagId) {
    const query = `
      DELETE FROM tags_applies
      WHERE kanban_card_id = $1 AND project_tag_id = $2
      RETURNING *;
    `;
    const res = await pool.query(query, [cardId, tagId]);
    return res.rows[0];
  }

  static async deleteTag(tagId) {
    const res = await pool.query('DELETE FROM project_tag WHERE id = $1 RETURNING id;', [tagId]);
    return res.rows[0];
  }

  static async updateTagDetails(tagId, { name, colorCode }) {
    const query = `
      UPDATE project_tag
      SET name = COALESCE($1, name),
          color_code = COALESCE($2, color_code)
      WHERE id = $3 RETURNING *;
    `;
    const res = await pool.query(query, [name, colorCode, tagId]);
    return res.rows[0];
  }
}
