import { pool } from '../config/db.js';
import { fileSize, removeFile } from '../utils/fileStore.js';

/**
 * Вложения карточек (таблица kanban_card_files: id, kanban_card_id, file_path, uploaded_at).
 * Колонка file_path хранит одно из:
 *   «upload:<ключ на диске>|<исходное имя>» — файл, загруженный на сервер;
 *   «http(s)://…» — внешняя ссылка.
 */
const UPLOAD_PREFIX = 'upload:';

export const encodeUpload = (key, name) => `${UPLOAD_PREFIX}${key}|${name.slice(0, 120)}`;

export function parseFilePath(filePath) {
  if (filePath.startsWith(UPLOAD_PREFIX)) {
    const rest = filePath.slice(UPLOAD_PREFIX.length);
    const i = rest.indexOf('|');
    return { kind: 'upload', key: rest.slice(0, i), name: rest.slice(i + 1) };
  }
  if (/^https?:\/\//i.test(filePath)) return { kind: 'link', key: null, name: filePath };
  return { kind: 'path', key: null, name: filePath };
}

async function present(row) {
  const info = parseFilePath(row.file_path);
  return {
    id: row.id,
    kanban_card_id: row.kanban_card_id,
    uploaded_at: row.uploaded_at,
    kind: info.kind,
    name: info.name,
    url: info.kind === 'link' ? row.file_path : null,
    size: info.kind === 'upload' ? await fileSize(info.key) : null,
  };
}

export class FileRepository {
  static async getCardFiles(cardId) {
    const res = await pool.query('SELECT * FROM kanban_card_files WHERE kanban_card_id = $1 ORDER BY uploaded_at, id', [cardId]);
    return Promise.all(res.rows.map(present));
  }

  static async findById(fileId) {
    const res = await pool.query('SELECT * FROM kanban_card_files WHERE id = $1', [fileId]);
    return res.rows[0] && { ...res.rows[0], ...parseFilePath(res.rows[0].file_path) };
  }

  /** Внешняя ссылка */
  static async addLinkToCard(cardId, url) {
    if (!/^https?:\/\//i.test(url)) throw new Error('400: Ссылка должна начинаться с http:// или https://');
    const res = await pool.query('INSERT INTO kanban_card_files (kanban_card_id, file_path) VALUES ($1, $2) RETURNING *', [cardId, url]);
    return present(res.rows[0]);
  }

  /** Файл, уже записанный на диск (ключ — из saveFile) */
  static async addUploadToCard(cardId, key, name) {
    const res = await pool.query('INSERT INTO kanban_card_files (kanban_card_id, file_path) VALUES ($1, $2) RETURNING *', [
      cardId,
      encodeUpload(key, name),
    ]);
    return present(res.rows[0]);
  }

  static async deleteFile(fileId) {
    const res = await pool.query('DELETE FROM kanban_card_files WHERE id = $1 RETURNING id, file_path', [fileId]);
    const row = res.rows[0];
    if (!row) return undefined;
    const info = parseFilePath(row.file_path);
    if (info.kind === 'upload') await removeFile(info.key);
    return { id: row.id };
  }

  /** Ключи файлов всех карточек доски — чтобы стереть их с диска при удалении колонки/карточек */
  static async uploadKeysWhere(whereSql, params) {
    const res = await pool.query(`SELECT f.file_path FROM kanban_card_files f WHERE ${whereSql}`, params);
    return res.rows.map((r) => parseFilePath(r.file_path)).filter((i) => i.kind === 'upload').map((i) => i.key);
  }
}
