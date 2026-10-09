import { pool } from '../config/db.js';

export class UserRepository {
  static async findByEmail(email) {
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0];
  }

  static async findById(id) {
    const res = await pool.query(
      'SELECT id, username, email, avatar_url, created_at FROM users WHERE id = $1',
      [id]
    );
    return res.rows[0];
  }

  static async createUser(username, email, passwordHash) {
    const res = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [username, email, passwordHash]
    );
    return res.rows[0];
  }

  // Добавить в UserRepository:
static async updateUsername(userId, username) {
  const query = `
    UPDATE users SET username = $1 WHERE id = $2
    RETURNING id, username, email, avatar_url, created_at;
  `;
  const res = await pool.query(query, [username, userId]);
  return res.rows[0];
}

static async updateEmail(userId, email) {
  const query = `
    UPDATE users SET email = $1 WHERE id = $2
    RETURNING id, username, email, avatar_url, created_at;
  `;
  const res = await pool.query(query, [email, userId]);
  return res.rows[0];
}

static async updatePassword(userId, passwordHash) {
  const query = `UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id;`;
  const res = await pool.query(query, [passwordHash, userId]);
  return res.rows[0];
}
// Добавить в UserRepository:
static async updateAvatar(userId, avatarUrl) {
  const query = `
    UPDATE users SET avatar_url = $1 WHERE id = $2
    RETURNING id, username, email, avatar_url, created_at;
  `;
  const res = await pool.query(query, [avatarUrl, userId]);
  return res.rows[0];
}

static async deleteUser(userId) {
  const query = `DELETE FROM users WHERE id = $1 RETURNING id;`;
  const res = await pool.query(query, [userId]);
  return res.rows[0];
}
}