import { pool } from '../config/db.js';

const RESOURCE_TYPES = ['FILE', 'LINK'];

function cleanText(value, label, max) {
  const clean = String(value ?? '').trim();
  if (!clean) throw new Error(`400: ${label} обязательно`);
  if (clean.length > max) throw new Error(`400: ${label} — не длиннее ${max} символов`);
  return clean;
}

function cleanResource(resourceType, resourcePath) {
  if (!RESOURCE_TYPES.includes(resourceType)) {
    throw new Error("400: resourceType должен быть 'FILE' или 'LINK'");
  }
  const path = cleanText(resourcePath, 'Путь или ссылка', 2048);
  if (resourceType === 'LINK' && !/^https?:\/\//i.test(path)) {
    throw new Error('400: Ссылка должна начинаться с http:// или https://');
  }
  return path;
}

/**
 * Общее хранилище проекта.
 * project_storage — логические папки («Репозитории», «Диздоки», «Отчёты»),
 * storage_files — загруженные файлы (FILE, путь) и внешние ссылки (LINK, URL GitHub/Figma и т.п.).
 */
export class StorageRepository {
  /** Все папки проекта вместе с их содержимым */
  static async listByProject(projectId) {
    const res = await pool.query(
      `SELECT ps.id, ps.project_id, ps.name, ps.description, ps.created_at,
              COALESCE(
                json_agg(json_build_object(
                  'id', sf.id,
                  'name', sf.name,
                  'resource_type', sf.resource_type,
                  'resource_path', sf.resource_path,
                  'uploaded_by', sf.uploaded_by,
                  'created_at', sf.created_at
                ) ORDER BY sf.created_at, sf.id) FILTER (WHERE sf.id IS NOT NULL),
                '[]'::json
              ) AS files
       FROM project_storage ps
       LEFT JOIN storage_files sf ON sf.project_storage_id = ps.id
       WHERE ps.project_id = $1
       GROUP BY ps.id
       ORDER BY ps.name;`,
      [projectId]
    );
    return res.rows;
  }

  static async createFolder(projectId, name, description) {
    const res = await pool.query(
      `INSERT INTO project_storage (project_id, name, description)
       VALUES ($1, $2, $3) RETURNING *;`,
      [projectId, cleanText(name, 'Название раздела', 100), description ? String(description).trim() : null]
    );
    return res.rows[0];
  }

  static async updateFolder(storageId, { name, description }) {
    const res = await pool.query(
      `UPDATE project_storage
       SET name = COALESCE($1, name),
           description = COALESCE($2, description)
       WHERE id = $3 RETURNING *;`,
      [
        name === undefined ? null : cleanText(name, 'Название раздела', 100),
        description === undefined ? null : String(description).trim(),
        storageId,
      ]
    );
    return res.rows[0];
  }

  /** Удаляет раздел вместе с файлами и ссылками внутри (ON DELETE CASCADE) */
  static async deleteFolder(storageId) {
    const res = await pool.query('DELETE FROM project_storage WHERE id = $1 RETURNING id;', [storageId]);
    return res.rows[0];
  }

  static async addFile(storageId, { resourceType, name, resourcePath }, userId) {
    const path = cleanResource(resourceType, resourcePath);
    const res = await pool.query(
      `INSERT INTO storage_files (project_storage_id, resource_type, name, resource_path, uploaded_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *;`,
      [storageId, resourceType, cleanText(name, 'Название', 255), path, userId]
    );
    return res.rows[0];
  }

  static async updateFile(fileId, { name, resourcePath }) {
    const current = await pool.query('SELECT resource_type FROM storage_files WHERE id = $1;', [fileId]);
    if (current.rows.length === 0) return undefined;
    const path =
      resourcePath === undefined ? null : cleanResource(current.rows[0].resource_type, resourcePath);

    const res = await pool.query(
      `UPDATE storage_files
       SET name = COALESCE($1, name),
           resource_path = COALESCE($2, resource_path)
       WHERE id = $3 RETURNING *;`,
      [name === undefined ? null : cleanText(name, 'Название', 255), path, fileId]
    );
    return res.rows[0];
  }

  static async deleteFile(fileId) {
    const res = await pool.query('DELETE FROM storage_files WHERE id = $1 RETURNING id;', [fileId]);
    return res.rows[0];
  }
}
