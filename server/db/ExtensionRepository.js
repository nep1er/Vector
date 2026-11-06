import { pool } from '../config/db.js';
import { compareSemver } from '../utils/extensionPackage.js';
import { removeVersionFiles, saveVersionFiles } from '../utils/extensionStore.js';
import { NotificationRepository } from './NotificationRepository.js';
import { PlatformRepository } from './PlatformRepository.js';

const NOT_BANNED = 'NOT EXISTS (SELECT 1 FROM extension_ban b WHERE b.user_id = e.author_id)';
// Самая новая одобренная версия расширения e
const LATEST_APPROVED = `(SELECT v.id FROM extension_version v
   WHERE v.extension_id = e.id AND v.status = 'APPROVED'
   ORDER BY string_to_array(v.version, '.')::int[] DESC LIMIT 1)`;

const MAX_UPLOADS_PER_HOUR = 10;

/** Причина, по которой расширение сейчас нельзя запускать (null — можно) */
function unusableReason({ ext_status, version_status, author_banned }) {
  if (ext_status === 'REMOVED') return 'REMOVED';
  if (author_banned) return 'BANNED';
  if (version_status !== 'APPROVED') return 'NOT_APPROVED';
  return null;
}

export class ExtensionRepository {
  // ------------------------------------------------------------ публикация
  /** Сохраняет проверенный пакет как новую версию (создаёт расширение при первой загрузке) */
  static async publish(authorId, analysis, { autoApprove = false } = {}) {
    const ban = await PlatformRepository.getBan(authorId);
    if (ban) throw new Error(`403: Вам запрещено публиковать расширения. Причина: ${ban.reason}`);
    const recent = await pool.query(
      `SELECT count(*)::int AS n FROM extension_version WHERE uploaded_by = $1 AND created_at > now() - interval '1 hour';`,
      [authorId]
    );
    if (recent.rows[0].n >= MAX_UPLOADS_PER_HOUR) throw new Error('429: Слишком много загрузок за час, попробуйте позже');

    const m = analysis.manifest;
    const client = await pool.connect();
    let versionId;
    let extensionId;
    try {
      await client.query('BEGIN');
      const found = (await client.query('SELECT * FROM extension WHERE slug = $1 FOR UPDATE;', [m.id])).rows[0];
      if (found) {
        if (found.author_id !== authorId) throw new Error('409: Расширение с таким id уже опубликовано другим автором');
        if (found.status === 'REMOVED') throw new Error('403: Расширение удалено модератором, новые версии загружать нельзя');
        const versions = (await client.query('SELECT version FROM extension_version WHERE extension_id = $1;', [found.id])).rows;
        const max = versions.map((r) => r.version).sort(compareSemver).pop();
        if (max && compareSemver(m.version, max) <= 0) throw new Error(`409: Версия должна быть выше текущей (${max})`);
        extensionId = found.id;
        await client.query('UPDATE extension SET name = $1, summary = $2 WHERE id = $3;', [m.name, m.description.slice(0, 300), extensionId]);
      } else {
        extensionId = (
          await client.query(
            'INSERT INTO extension (slug, author_id, name, summary) VALUES ($1, $2, $3, $4) RETURNING id;',
            [m.id, authorId, m.name, m.description.slice(0, 300)]
          )
        ).rows[0].id;
      }
      const v = (
        await client.query(
          `INSERT INTO extension_version (extension_id, version, manifest, warnings, sha256, size_bytes, file_count, status, uploaded_by)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9) RETURNING *;`,
          [extensionId, m.version, JSON.stringify(m), JSON.stringify(analysis.warnings), analysis.sha256, analysis.size, analysis.files.length, autoApprove ? 'APPROVED' : 'PENDING', authorId]
        )
      ).rows[0];
      versionId = v.id;
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    try {
      await saveVersionFiles(versionId, analysis.contents);
    } catch (e) {
      await pool.query('DELETE FROM extension_version WHERE id = $1;', [versionId]);
      await removeVersionFiles(versionId);
      throw e;
    }
    if (!autoApprove) {
      const staff = (await PlatformRepository.staffIds()).filter((id) => id !== authorId);
      await NotificationRepository.createMany(staff, 'EXTENSION_REVIEW', {
        kind: 'SUBMITTED', extension_id: extensionId, extension_name: m.name, version: m.version,
      }).catch(() => {});
    }
    return this.getVersion(versionId);
  }

  static async getVersion(versionId) {
    const res = await pool.query(
      `SELECT v.*, e.slug, e.name AS extension_name, e.author_id, e.status AS extension_status, u.username AS author_name
       FROM extension_version v JOIN extension e ON e.id = v.extension_id JOIN users u ON u.id = e.author_id
       WHERE v.id = $1;`,
      [versionId]
    );
    return res.rows[0] ?? null;
  }

  // ------------------------------------------------------------ каталог
  static async catalog(userId, q = '') {
    const like = `%${String(q).trim().replace(/[\\%_]/g, '\\$&')}%`;
    const res = await pool.query(
      `SELECT e.id, e.slug, e.name, e.summary, e.author_id, u.username AS author_name,
              lv.id AS version_id, lv.version, lv.manifest,
              (SELECT count(*)::int FROM user_extension ue WHERE ue.extension_id = e.id) AS library_count,
              EXISTS (SELECT 1 FROM user_extension ue WHERE ue.extension_id = e.id AND ue.user_id = $1) AS in_library
       FROM extension e
       JOIN users u ON u.id = e.author_id
       JOIN extension_version lv ON lv.id = ${LATEST_APPROVED}
       WHERE e.status = 'ACTIVE' AND ${NOT_BANNED}
         AND ($2 = '%%' OR e.name ILIKE $2 OR e.slug ILIKE $2 OR e.summary ILIKE $2)
       ORDER BY library_count DESC, e.name;`,
      [userId, like]
    );
    return res.rows;
  }

  /** Карточка расширения. Автор и модераторы видят все версии, остальные — только одобренные */
  static async details(extensionId, viewerId, viewerRole) {
    const ext = (
      await pool.query(
        `SELECT e.*, u.username AS author_name,
                EXISTS (SELECT 1 FROM extension_ban b WHERE b.user_id = e.author_id) AS author_banned,
                EXISTS (SELECT 1 FROM user_extension ue WHERE ue.extension_id = e.id AND ue.user_id = $2) AS in_library,
                (SELECT count(*)::int FROM user_extension ue WHERE ue.extension_id = e.id) AS library_count
         FROM extension e JOIN users u ON u.id = e.author_id WHERE e.id = $1;`,
        [extensionId, viewerId]
      )
    ).rows[0];
    if (!ext) return null;
    const privileged = ext.author_id === viewerId || !!viewerRole;
    const versions = (
      await pool.query(
        `SELECT id, version, manifest, warnings, size_bytes, file_count, status, review_note, reviewed_at, created_at
         FROM extension_version WHERE extension_id = $1 ${privileged ? '' : "AND status = 'APPROVED'"}
         ORDER BY string_to_array(version, '.')::int[] DESC;`,
        [extensionId]
      )
    ).rows;
    if (!privileged && (ext.status !== 'ACTIVE' || ext.author_banned || versions.length === 0)) return null;
    const { removed_reason, removed_at, ...pub } = ext;
    return { ...(privileged ? ext : pub), versions };
  }

  static async mine(userId) {
    const res = await pool.query(
      `SELECT e.id, e.slug, e.name, e.summary, e.status, e.removed_reason, e.created_at,
              (SELECT count(*)::int FROM user_extension ue WHERE ue.extension_id = e.id) AS library_count,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'version', v.version, 'status', v.status,
                          'review_note', v.review_note, 'warnings', v.warnings, 'created_at', v.created_at)
                        ORDER BY v.created_at DESC) FROM extension_version v WHERE v.extension_id = e.id), '[]'::jsonb) AS versions
       FROM extension e WHERE e.author_id = $1 ORDER BY e.created_at DESC;`,
      [userId]
    );
    return res.rows;
  }

  static async deleteOwn(extensionId, userId) {
    const ids = await pool.query('SELECT id FROM extension_version WHERE extension_id = $1;', [extensionId]);
    const res = await pool.query('DELETE FROM extension WHERE id = $1 AND author_id = $2 RETURNING id;', [extensionId, userId]);
    if (res.rowCount === 0) throw new Error('404: Расширение не найдено');
    for (const r of ids.rows) await removeVersionFiles(r.id);
  }

  // ------------------------------------------------------------ библиотека
  static async library(userId) {
    const res = await pool.query(
      `SELECT e.id, e.slug, e.name, e.summary, e.status AS ext_status, ue.added_at, u.username AS author_name,
              EXISTS (SELECT 1 FROM extension_ban b WHERE b.user_id = e.author_id) AS author_banned,
              lv.id AS version_id, lv.version, lv.manifest
       FROM user_extension ue
       JOIN extension e ON e.id = ue.extension_id
       JOIN users u ON u.id = e.author_id
       LEFT JOIN extension_version lv ON lv.id = ${LATEST_APPROVED}
       WHERE ue.user_id = $1 ORDER BY ue.added_at DESC;`,
      [userId]
    );
    return res.rows.map((r) => ({ ...r, unusable: unusableReason({ ext_status: r.ext_status, version_status: r.version_id ? 'APPROVED' : 'NONE', author_banned: r.author_banned }) }));
  }

  static async addToLibrary(userId, extensionId) {
    const ok = await pool.query(
      `SELECT 1 FROM extension e WHERE e.id = $1 AND e.status = 'ACTIVE' AND ${NOT_BANNED} AND ${LATEST_APPROVED} IS NOT NULL;`,
      [extensionId]
    );
    if (ok.rowCount === 0) throw new Error('404: Расширение не найдено или недоступно');
    await pool.query('INSERT INTO user_extension (user_id, extension_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;', [userId, extensionId]);
  }

  static async removeFromLibrary(userId, extensionId) {
    await pool.query('DELETE FROM user_extension WHERE user_id = $1 AND extension_id = $2;', [userId, extensionId]);
  }

  static async report(extensionId, userId, reason) {
    const text = String(reason ?? '').trim();
    if (text.length < 5 || text.length > 1000) throw new Error('400: Опишите жалобу (от 5 до 1000 символов)');
    const ext = await pool.query('SELECT 1 FROM extension WHERE id = $1;', [extensionId]);
    if (ext.rowCount === 0) throw new Error('404: Расширение не найдено');
    const dup = await pool.query('SELECT 1 FROM extension_report WHERE extension_id = $1 AND reporter_id = $2 AND resolved_at IS NULL;', [extensionId, userId]);
    if (dup.rowCount > 0) throw new Error('409: Ваша жалоба на это расширение уже рассматривается');
    await pool.query('INSERT INTO extension_report (extension_id, reporter_id, reason) VALUES ($1, $2, $3);', [extensionId, userId, text]);
  }

  // ------------------------------------------------------------ проект
  static async forProject(projectId) {
    const res = await pool.query(
      `SELECT pe.id, pe.extension_id, pe.version_id, pe.granted_permissions, pe.enabled, pe.installed_at,
              e.slug, e.name, e.status AS ext_status, u.username AS author_name,
              v.version, v.status AS version_status, v.manifest,
              EXISTS (SELECT 1 FROM extension_ban b WHERE b.user_id = e.author_id) AS author_banned,
              lv.id AS latest_version_id, lv.version AS latest_version, lv.manifest AS latest_manifest
       FROM project_extension pe
       JOIN extension e ON e.id = pe.extension_id
       JOIN users u ON u.id = e.author_id
       JOIN extension_version v ON v.id = pe.version_id
       LEFT JOIN extension_version lv ON lv.id = ${LATEST_APPROVED}
       WHERE pe.project_id = $1 ORDER BY pe.installed_at;`,
      [projectId]
    );
    return res.rows.map((r) => {
      const unusable = unusableReason(r);
      const newer = r.latest_version && compareSemver(r.latest_version, r.version) > 0;
      const have = new Set(r.manifest.permissions ?? []);
      return {
        id: r.id, extension_id: r.extension_id, version_id: r.version_id, slug: r.slug, name: r.name, author_name: r.author_name,
        version: r.version, manifest: r.manifest, granted_permissions: r.granted_permissions, enabled: r.enabled, installed_at: r.installed_at,
        unusable, usable: r.enabled && !unusable,
        update: newer ? { version: r.latest_version, new_permissions: (r.latest_manifest.permissions ?? []).filter((p) => !have.has(p)) } : null,
      };
    });
  }

  static async install(projectId, userId, extensionId, permissions) {
    const lib = await pool.query('SELECT 1 FROM user_extension WHERE user_id = $1 AND extension_id = $2;', [userId, extensionId]);
    if (lib.rowCount === 0) throw new Error('400: Сначала добавьте расширение в свою библиотеку');
    const v = (
      await pool.query(
        `SELECT lv.id, lv.manifest FROM extension e JOIN extension_version lv ON lv.id = ${LATEST_APPROVED}
         WHERE e.id = $1 AND e.status = 'ACTIVE' AND ${NOT_BANNED};`,
        [extensionId]
      )
    ).rows[0];
    if (!v) throw new Error('404: Расширение недоступно');
    const granted = this.checkGrant(v.manifest, permissions);
    const res = await pool.query(
      `INSERT INTO project_extension (project_id, extension_id, version_id, granted_permissions, installed_by)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (project_id, extension_id) DO NOTHING RETURNING id;`,
      [projectId, extensionId, v.id, granted, userId]
    );
    if (res.rowCount === 0) throw new Error('409: Расширение уже установлено в проект');
  }

  /** Выдаваемые права обязаны быть подмножеством запрошенных в манифесте */
  static checkGrant(manifest, permissions) {
    const asked = new Set(manifest.permissions ?? []);
    const list = Array.isArray(permissions) ? [...new Set(permissions)] : [];
    for (const p of list) if (!asked.has(p)) throw new Error(`400: Расширение не запрашивало право «${p}»`);
    return list;
  }

  static async patchInstall(projectId, extensionId, { enabled, permissions }) {
    const row = (
      await pool.query(
        `SELECT pe.id, v.manifest FROM project_extension pe JOIN extension_version v ON v.id = pe.version_id
         WHERE pe.project_id = $1 AND pe.extension_id = $2;`,
        [projectId, extensionId]
      )
    ).rows[0];
    if (!row) throw new Error('404: Расширение не установлено в этом проекте');
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') throw new Error('400: enabled — true или false');
      await pool.query('UPDATE project_extension SET enabled = $1 WHERE id = $2;', [enabled, row.id]);
    }
    if (permissions !== undefined) {
      await pool.query('UPDATE project_extension SET granted_permissions = $1 WHERE id = $2;', [this.checkGrant(row.manifest, permissions), row.id]);
    }
  }

  /** Обновление до новой одобренной версии. Новые права нужно явно подтвердить. */
  static async updateInstall(projectId, extensionId, permissions) {
    const row = (
      await pool.query(
        `SELECT pe.id, pe.granted_permissions, v.version, v.manifest FROM project_extension pe
         JOIN extension_version v ON v.id = pe.version_id WHERE pe.project_id = $1 AND pe.extension_id = $2;`,
        [projectId, extensionId]
      )
    ).rows[0];
    if (!row) throw new Error('404: Расширение не установлено в этом проекте');
    const latest = (
      await pool.query(
        `SELECT lv.id, lv.version, lv.manifest FROM extension e JOIN extension_version lv ON lv.id = ${LATEST_APPROVED}
         WHERE e.id = $1 AND e.status = 'ACTIVE' AND ${NOT_BANNED};`,
        [extensionId]
      )
    ).rows[0];
    if (!latest || compareSemver(latest.version, row.version) <= 0) throw new Error('400: Обновлений нет');
    const before = new Set(row.manifest.permissions ?? []);
    const added = (latest.manifest.permissions ?? []).filter((p) => !before.has(p));
    const confirmed = new Set(Array.isArray(permissions) ? permissions : []);
    const missing = added.filter((p) => !confirmed.has(p));
    if (missing.length) throw new Error(`400: Новая версия запрашивает дополнительные права: ${missing.join(', ')}. Подтвердите их явно`);
    const keep = row.granted_permissions.filter((p) => (latest.manifest.permissions ?? []).includes(p));
    const granted = [...new Set([...keep, ...added])];
    await pool.query('UPDATE project_extension SET version_id = $1, granted_permissions = $2 WHERE id = $3;', [latest.id, granted, row.id]);
  }

  static async removeInstall(projectId, extensionId) {
    await pool.query('DELETE FROM extension_data WHERE project_id = $1 AND extension_id = $2;', [projectId, extensionId]);
    const res = await pool.query('DELETE FROM project_extension WHERE project_id = $1 AND extension_id = $2 RETURNING id;', [projectId, extensionId]);
    if (res.rowCount === 0) throw new Error('404: Расширение не установлено в этом проекте');
  }

  // ------------------------------------------------------------ данные расширения
  /** Проверка, что расширение установлено, работает и ему выдано право perm. Возвращает строку установки. */
  static async dataGate(projectId, extensionId, perm) {
    const row = (
      await pool.query(
        `SELECT pe.id, pe.enabled, pe.granted_permissions, e.status AS ext_status, v.status AS version_status,
                EXISTS (SELECT 1 FROM extension_ban b WHERE b.user_id = e.author_id) AS author_banned
         FROM project_extension pe JOIN extension e ON e.id = pe.extension_id JOIN extension_version v ON v.id = pe.version_id
         WHERE pe.project_id = $1 AND pe.extension_id = $2;`,
        [projectId, extensionId]
      )
    ).rows[0];
    if (!row) throw new Error('404: Расширение не установлено в этом проекте');
    if (!row.enabled || unusableReason(row)) throw new Error('403: Расширение сейчас отключено');
    if (!row.granted_permissions.includes(perm)) throw new Error(`403: Проект не выдал расширению право «${perm}»`);
    return row;
  }

  static checkCollection(c) {
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(String(c))) throw new Error('400: Некорректное имя коллекции');
    return String(c);
  }

  static checkKey(k) {
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(String(k))) throw new Error('400: Некорректный ключ');
    return String(k);
  }

  static async dataList(projectId, extensionId, collection) {
    await this.dataGate(projectId, extensionId, 'data:read');
    const res = await pool.query(
      'SELECT key, value FROM extension_data WHERE project_id = $1 AND extension_id = $2 AND collection = $3 ORDER BY key LIMIT 5000;',
      [projectId, extensionId, this.checkCollection(collection)]
    );
    return res.rows;
  }

  static async dataSet(projectId, extensionId, userId, collection, key, value) {
    await this.dataGate(projectId, extensionId, 'data:write');
    const json = JSON.stringify(value ?? null);
    if (json === undefined || Buffer.byteLength(json) > 16 * 1024) throw new Error('400: Значение больше 16 КБ');
    const c = this.checkCollection(collection);
    const k = this.checkKey(key);
    const cnt = await pool.query('SELECT count(*)::int AS n FROM extension_data WHERE project_id = $1 AND extension_id = $2;', [projectId, extensionId]);
    const exists = await pool.query('SELECT 1 FROM extension_data WHERE project_id = $1 AND extension_id = $2 AND collection = $3 AND key = $4;', [projectId, extensionId, c, k]);
    if (exists.rowCount === 0 && cnt.rows[0].n >= 5000) throw new Error('400: Достигнут предел хранилища расширения (5000 записей)');
    await pool.query(
      `INSERT INTO extension_data (project_id, extension_id, collection, key, value, updated_by)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (project_id, extension_id, collection, key)
       DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();`,
      [projectId, extensionId, c, k, json, userId]
    );
  }

  static async dataRemove(projectId, extensionId, collection, key) {
    await this.dataGate(projectId, extensionId, 'data:write');
    await pool.query('DELETE FROM extension_data WHERE project_id = $1 AND extension_id = $2 AND collection = $3 AND key = $4;', [
      projectId, extensionId, this.checkCollection(collection), this.checkKey(key),
    ]);
  }

  // ------------------------------------------------------------ журнал вызовов
  static async recordAudit(projectId, extensionId, userId, entries) {
    const inst = await pool.query('SELECT 1 FROM project_extension WHERE project_id = $1 AND extension_id = $2;', [projectId, extensionId]);
    if (inst.rowCount === 0) throw new Error('404: Расширение не установлено в этом проекте');
    const list = (Array.isArray(entries) ? entries : []).slice(0, 50).filter((e) => typeof e?.method === 'string' && /^[a-zA-Z.]{1,60}$/.test(e.method));
    for (const e of list) {
      await pool.query('INSERT INTO extension_audit (project_id, extension_id, user_id, method, ok) VALUES ($1, $2, $3, $4, $5);', [projectId, extensionId, userId, e.method, e.ok !== false]);
    }
  }

  static async auditList(projectId, extensionId, limit = 100) {
    const res = await pool.query(
      `SELECT a.method, a.ok, a.created_at, u.username FROM extension_audit a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.project_id = $1 AND a.extension_id = $2 ORDER BY a.created_at DESC, a.id DESC LIMIT $3;`,
      [projectId, extensionId, limit]
    );
    return res.rows;
  }

  // ------------------------------------------------------------ раздача файлов
  /** Версия, которую сейчас можно отдавать всем (расширение активно, автор не забанен, версия одобрена) */
  static async servableVersion(versionId) {
    const res = await pool.query(
      `SELECT v.id FROM extension_version v JOIN extension e ON e.id = v.extension_id
       WHERE v.id = $1 AND v.status = 'APPROVED' AND e.status = 'ACTIVE' AND ${NOT_BANNED};`,
      [versionId]
    );
    return res.rowCount > 0;
  }

  // ------------------------------------------------------------ модерация
  static async queue() {
    const res = await pool.query(
      `SELECT v.id, v.version, v.manifest, v.warnings, v.size_bytes, v.file_count, v.created_at,
              e.id AS extension_id, e.name, e.slug, e.author_id, u.username AS author_name,
              EXISTS (SELECT 1 FROM extension_ban b WHERE b.user_id = e.author_id) AS author_banned
       FROM extension_version v JOIN extension e ON e.id = v.extension_id JOIN users u ON u.id = e.author_id
       WHERE v.status = 'PENDING' AND e.status = 'ACTIVE' ORDER BY v.created_at;`
    );
    return res.rows;
  }

  /** Все расширения платформы (для модератора), в т.ч. удалённые и отклонённые */
  static async listAll(q = '') {
    const like = `%${String(q).trim().replace(/[\\%_]/g, '\\$&')}%`;
    const res = await pool.query(
      `SELECT e.id, e.slug, e.name, e.status, e.removed_reason, e.created_at, e.author_id, u.username AS author_name,
              EXISTS (SELECT 1 FROM extension_ban b WHERE b.user_id = e.author_id) AS author_banned,
              (SELECT count(*)::int FROM user_extension ue WHERE ue.extension_id = e.id) AS library_count,
              (SELECT count(*)::int FROM project_extension pe WHERE pe.extension_id = e.id) AS projects_count
       FROM extension e JOIN users u ON u.id = e.author_id
       WHERE ($1 = '%%' OR e.name ILIKE $1 OR e.slug ILIKE $1 OR u.username ILIKE $1)
       ORDER BY e.created_at DESC LIMIT 200;`,
      [like]
    );
    return res.rows;
  }

  static async review(versionId, moderator, approve, note) {
    const text = String(note ?? '').trim();
    if (!approve && text.length < 5) throw new Error('400: При отклонении укажите причину (от 5 символов)');
    const v = await this.getVersion(versionId);
    if (!v) throw new Error('404: Версия не найдена');
    if (v.status !== 'PENDING') throw new Error('409: Версия уже рассмотрена');
    await pool.query(
      `UPDATE extension_version SET status = $1, reviewed_by = $2, reviewed_at = now(), review_note = $3 WHERE id = $4;`,
      [approve ? 'APPROVED' : 'REJECTED', moderator, text || null, versionId]
    );
    await PlatformRepository.log(moderator, approve ? 'VERSION_APPROVE' : 'VERSION_REJECT', 'version', versionId, `${v.extension_name} ${v.version}`, text || null);
    await NotificationRepository.create(v.author_id, 'EXTENSION_REVIEW', {
      kind: approve ? 'APPROVED' : 'REJECTED', extension_id: v.extension_id, extension_name: v.extension_name, version: v.version, note: text,
    }).catch(() => {});
  }

  /** Администраторы проектов, где установлены перечисленные расширения: [{user_id, project_id, project_title, extension_id}] */
  static async projectAdmins(extensionIds) {
    if (extensionIds.length === 0) return [];
    const res = await pool.query(
      `SELECT DISTINCT pp.user_id, p.id AS project_id, p.title AS project_title, pe.extension_id
       FROM project_extension pe
       JOIN project p ON p.id = pe.project_id
       JOIN project_participants pp ON pp.project_id = p.id
       JOIN assigned_roles ar ON ar.project_participant_id = pp.id
       JOIN role_access_rights rar ON rar.project_role_id = ar.project_role_id
       JOIN access_rights a ON a.id = rar.access_right_id AND a.name = 'ADMIN'
       WHERE pe.extension_id = ANY($1::bigint[]);`,
      [extensionIds]
    );
    return res.rows;
  }

  static async notifyProjectAdmins(extensionIds, names, reason) {
    const rows = await this.projectAdmins(extensionIds);
    for (const r of rows) {
      await NotificationRepository.create(r.user_id, 'EXTENSION_DISABLED', {
        project_id: r.project_id, project_title: r.project_title, extension_id: r.extension_id, extension_name: names.get(r.extension_id) ?? '', reason,
      }).catch(() => {});
    }
  }

  static async removeByModerator(extensionId, moderator, reason) {
    const text = String(reason ?? '').trim();
    if (text.length < 5) throw new Error('400: Укажите причину (от 5 символов)');
    const res = await pool.query(
      `UPDATE extension SET status = 'REMOVED', removed_by = $1, removed_reason = $2, removed_at = now()
       WHERE id = $3 AND status = 'ACTIVE' RETURNING id, name, author_id;`,
      [moderator, text, extensionId]
    );
    const ext = res.rows[0];
    if (!ext) throw new Error('404: Расширение не найдено или уже удалено');
    await PlatformRepository.log(moderator, 'EXTENSION_REMOVE', 'extension', ext.id, ext.name, text);
    await NotificationRepository.create(ext.author_id, 'EXTENSION_REVIEW', { kind: 'REMOVED', extension_id: ext.id, extension_name: ext.name, note: text }).catch(() => {});
    await this.notifyProjectAdmins([ext.id], new Map([[ext.id, ext.name]]), text);
  }

  static async restore(extensionId, moderator) {
    const res = await pool.query(
      `UPDATE extension SET status = 'ACTIVE', removed_by = NULL, removed_reason = NULL, removed_at = NULL
       WHERE id = $1 AND status = 'REMOVED' RETURNING id, name;`,
      [extensionId]
    );
    if (!res.rows[0]) throw new Error('404: Расширение не найдено среди удалённых');
    await PlatformRepository.log(moderator, 'EXTENSION_RESTORE', 'extension', res.rows[0].id, res.rows[0].name, null);
  }

  /** Бан автора только в части расширений: аккаунт, проекты и работа в них не затрагиваются */
  static async ban(moderator, identifier, reason) {
    const text = String(reason ?? '').trim();
    if (text.length < 5) throw new Error('400: Укажите причину бана (от 5 символов)');
    const user = await PlatformRepository.findUser(identifier);
    if (await PlatformRepository.getRole(user.id)) throw new Error('403: Администратора и модератора забанить нельзя — сначала снимите роль');
    const res = await pool.query(
      'INSERT INTO extension_ban (user_id, reason, banned_by) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO NOTHING RETURNING user_id;',
      [user.id, text, moderator]
    );
    if (res.rowCount === 0) throw new Error('409: Пользователь уже забанен');
    await PlatformRepository.log(moderator, 'AUTHOR_BAN', 'user', user.id, user.username, text);
    await NotificationRepository.create(user.id, 'EXTENSION_BAN', { banned: true, reason: text }).catch(() => {});
    const exts = (await pool.query('SELECT id, name FROM extension WHERE author_id = $1;', [user.id])).rows;
    await this.notifyProjectAdmins(exts.map((e) => e.id), new Map(exts.map((e) => [e.id, e.name])), `Автор расширения заблокирован модератором: ${text}`);
    return user;
  }

  static async unban(moderator, userId) {
    const res = await pool.query('DELETE FROM extension_ban WHERE user_id = $1 RETURNING user_id;', [userId]);
    if (res.rowCount === 0) throw new Error('404: Пользователь не забанен');
    const u = await pool.query('SELECT username FROM users WHERE id = $1;', [userId]);
    await PlatformRepository.log(moderator, 'AUTHOR_UNBAN', 'user', userId, u.rows[0]?.username ?? null, null);
    await NotificationRepository.create(userId, 'EXTENSION_BAN', { banned: false }).catch(() => {});
  }

  static async bans() {
    const res = await pool.query(
      `SELECT b.user_id, u.username, b.reason, b.banned_at, bb.username AS banned_by_name,
              (SELECT count(*)::int FROM extension e WHERE e.author_id = b.user_id) AS extensions_count
       FROM extension_ban b JOIN users u ON u.id = b.user_id LEFT JOIN users bb ON bb.id = b.banned_by
       ORDER BY b.banned_at DESC;`
    );
    return res.rows;
  }

  static async reports(onlyOpen = true) {
    const res = await pool.query(
      `SELECT r.id, r.extension_id, e.name AS extension_name, r.reason, r.created_at, r.resolved_at,
              ru.username AS reporter_name, rb.username AS resolved_by_name
       FROM extension_report r JOIN extension e ON e.id = r.extension_id
       LEFT JOIN users ru ON ru.id = r.reporter_id LEFT JOIN users rb ON rb.id = r.resolved_by
       ${onlyOpen ? 'WHERE r.resolved_at IS NULL' : ''} ORDER BY r.created_at DESC LIMIT 200;`
    );
    return res.rows;
  }

  static async resolveReport(reportId, moderator) {
    const res = await pool.query(
      'UPDATE extension_report SET resolved_at = now(), resolved_by = $1 WHERE id = $2 AND resolved_at IS NULL RETURNING extension_id;',
      [moderator, reportId]
    );
    if (res.rowCount === 0) throw new Error('404: Жалоба не найдена или уже закрыта');
    await PlatformRepository.log(moderator, 'REPORT_RESOLVE', 'extension', res.rows[0].extension_id, null, null);
  }
}
