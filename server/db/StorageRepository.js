import { pool } from '../config/db.js';
import { fileSize, removeFile } from '../utils/fileStore.js';

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
  static async listByProject(projectId, { userId = null, seeAll = true } = {}) {
    const res = await pool.query(
      `SELECT ps.id, ps.project_id, ps.name, ps.description, ps.created_at,
              COALESCE(
                json_agg(json_build_object(
                  'id', sf.id,
                  'name', sf.name,
                  'resource_type', sf.resource_type,
                  'resource_path', sf.resource_path,
                  'uploaded_by', sf.uploaded_by,
                  'uploader_name', u.username,
                  'created_at', sf.created_at
                ) ORDER BY sf.created_at, sf.id) FILTER (WHERE sf.id IS NOT NULL),
                '[]'::json
              ) AS files,
              (SELECT COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name) ORDER BY r.name), '[]'::json)
                 FROM storage_role_visibility v JOIN project_roles r ON r.id = v.project_role_id
                 WHERE v.project_storage_id = ps.id) AS visible_roles
       FROM project_storage ps
       LEFT JOIN storage_files sf ON sf.project_storage_id = ps.id
       LEFT JOIN users u ON u.id = sf.uploaded_by
       WHERE ps.project_id = $1
       GROUP BY ps.id
       ORDER BY ps.name;`,
      [projectId]
    );
    // Не администратор не видит хранилища, закрытые от всех его ролей
    let rows = res.rows;
    if (!seeAll) {
      const mine = await pool.query(
        `SELECT ar.project_role_id AS id
         FROM project_participants pp JOIN assigned_roles ar ON ar.project_participant_id = pp.id
         WHERE pp.user_id = $1 AND pp.project_id = $2;`,
        [userId, projectId]
      );
      const roleIds = new Set(mine.rows.map((r) => Number(r.id)));
      rows = rows.filter((f) => f.visible_roles.length === 0 || f.visible_roles.some((r) => roleIds.has(Number(r.id))));
    }
    // Для загруженных файлов добавляем размер, ключ на диске наружу не отдаём
    for (const folder of rows) {
      folder.files = await Promise.all(
        folder.files.map(async ({ resource_path, ...f }) =>
          f.resource_type === 'FILE'
            ? { ...f, size: await fileSize(resource_path) }
            : { ...f, resource_path }
        )
      );
    }
    return rows;
  }

  /** Видит ли пользователь хранилище (нет ограничений по ролям или у него есть одна из ролей) */
  static async canSee(storageId, userId) {
    const res = await pool.query(
      `SELECT (
         NOT EXISTS (SELECT 1 FROM storage_role_visibility v WHERE v.project_storage_id = $1)
         OR EXISTS (
           SELECT 1 FROM storage_role_visibility v
           JOIN assigned_roles ar ON ar.project_role_id = v.project_role_id
           JOIN project_participants pp ON pp.id = ar.project_participant_id
           WHERE v.project_storage_id = $1 AND pp.user_id = $2)
       ) AS ok;`,
      [storageId, userId]
    );
    return res.rows[0].ok;
  }

  static async getRoles(storageId, client = pool) {
    const res = await client.query(
      `SELECT r.id, r.name FROM storage_role_visibility v
       JOIN project_roles r ON r.id = v.project_role_id
       WHERE v.project_storage_id = $1 ORDER BY r.name;`,
      [storageId]
    );
    return res.rows;
  }

  /** Полностью заменяет список ролей. Пустой список = «видно всем» */
  static async setRoles(storageId, roleIds) {
    if (!Array.isArray(roleIds)) throw new Error('400: roleIds должен быть массивом');
    const ids = [...new Set(roleIds.map(Number))];
    if (ids.some((n) => !Number.isInteger(n))) throw new Error('400: roleIds — целые числа');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const st = await client.query('SELECT project_id FROM project_storage WHERE id = $1 FOR UPDATE;', [storageId]);
      if (st.rows.length === 0) throw new Error('404: Хранилище не найдено');
      const projectId = st.rows[0].project_id;
      if (ids.length > 0) {
        const ok = await client.query(
          'SELECT COUNT(*)::int AS n FROM project_roles WHERE project_id = $1 AND id = ANY($2::bigint[]);',
          [projectId, ids]
        );
        if (ok.rows[0].n !== ids.length) throw new Error('400: Одна из ролей не найдена или относится к другому проекту');
      }
      await client.query('DELETE FROM storage_role_visibility WHERE project_storage_id = $1;', [storageId]);
      if (ids.length > 0) {
        await client.query(
          `INSERT INTO storage_role_visibility (project_storage_id, project_role_id, project_id)
           SELECT $1, rid, $3 FROM unnest($2::bigint[]) AS rid;`,
          [storageId, ids, projectId]
        );
      }
      const roles = await this.getRoles(storageId, client);
      await client.query('COMMIT');
      return roles;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async findFile(fileId) {
    const res = await pool.query('SELECT * FROM storage_files WHERE id = $1;', [fileId]);
    return res.rows[0];
  }

  /** Сохраняет уже записанный на диск файл как запись типа FILE */
  static async addUploadedFile(storageId, name, key, userId) {
    const res = await pool.query(
      `INSERT INTO storage_files (project_storage_id, resource_type, name, resource_path, uploaded_by)
       VALUES ($1, 'FILE', $2, $3, $4) RETURNING id, project_storage_id, resource_type, name, uploaded_by, created_at;`,
      [storageId, cleanText(name, 'Название', 255), key, userId]
    );
    return res.rows[0];
  }

  static async createFolder(projectId, name, description, roleIds = []) {
    const res = await pool.query(
      `INSERT INTO project_storage (project_id, name, description)
       VALUES ($1, $2, $3) RETURNING *;`,
      [projectId, cleanText(name, 'Название раздела', 100), description ? String(description).trim() : null]
    );
    const folder = res.rows[0];
    if (roleIds.length > 0) {
      try {
        folder.visible_roles = await this.setRoles(folder.id, roleIds);
      } catch (e) {
        await pool.query('DELETE FROM project_storage WHERE id = $1;', [folder.id]);
        throw e;
      }
    } else {
      folder.visible_roles = [];
    }
    return folder;
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
    const files = await pool.query(
      `SELECT resource_path FROM storage_files WHERE project_storage_id = $1 AND resource_type = 'FILE';`,
      [storageId]
    );
    const res = await pool.query('DELETE FROM project_storage WHERE id = $1 RETURNING id;', [storageId]);
    if (res.rows[0]) for (const f of files.rows) await removeFile(f.resource_path);
    return res.rows[0];
  }

  /** Только внешние ссылки; файлы загружаются через addUploadedFile */
  static async addFile(storageId, { resourceType, name, resourcePath }, userId) {
    if (resourceType !== 'LINK') {
      throw new Error('400: Файл нужно загрузить (POST /api/storage/:storageId/upload); здесь можно добавить только ссылку (LINK)');
    }
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
    if (resourcePath !== undefined && current.rows[0].resource_type !== 'LINK') {
      throw new Error('400: Путь можно менять только у ссылки; у загруженного файла — только название');
    }
    const path =
      resourcePath === undefined ? null : cleanResource(current.rows[0].resource_type, resourcePath);

    const res = await pool.query(
      `UPDATE storage_files
       SET name = COALESCE($1, name),
           resource_path = COALESCE($2, resource_path)
       WHERE id = $3 RETURNING *;`,
      [name === undefined ? null : cleanText(name, 'Название', 255), path, fileId]
    );
    const row = res.rows[0];
    if (row?.resource_type === 'FILE') delete row.resource_path; // ключ на диске наружу не отдаём
    return row;
  }

  static async deleteFile(fileId) {
    const res = await pool.query('DELETE FROM storage_files WHERE id = $1 RETURNING id, resource_type, resource_path;', [fileId]);
    const row = res.rows[0];
    if (row?.resource_type === 'FILE') await removeFile(row.resource_path);
    return row && { id: row.id };
  }
}
