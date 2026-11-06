import express, { Router } from 'express';
import jwt from 'jsonwebtoken';
import { ExtensionRepository } from '../db/ExtensionRepository.js';
import { PlatformRepository } from '../db/PlatformRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { requirePlatformRole } from '../middleware/platformMiddleware.js';
import { checkProjectAccess } from '../middleware/rbacMiddleware.js';
import { analyzePackage, LIMITS, PERMISSIONS } from '../utils/extensionPackage.js';
import { readVersionText } from '../utils/extensionStore.js';
import { sendError } from '../utils/httpError.js';

const router = Router();
const rawZip = express.raw({ type: () => true, limit: `${Math.ceil(LIMITS.maxZipBytes / 1024 / 1024)}mb` });
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error('400: Некорректный идентификатор');
  return n;
};
const wrap = (fn, msg) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    sendError(res, e, msg ?? 'Ошибка расширений');
  }
};
const mod = [authMiddleware, requirePlatformRole('MODERATOR')];
const adm = [authMiddleware, requirePlatformRole('ADMIN')];

/**
 * @swagger
 * /api/platform/me:
 *   get:
 *     summary: "Глобальная роль текущего пользователя (ADMIN | MODERATOR | null), бан расширений и список допустимых прав"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{role, ban, permissions}" }
 */
router.get('/platform/me', authMiddleware, wrap(async (req, res) => {
  res.json({ role: await PlatformRepository.getRole(req.user.id), ban: await PlatformRepository.getBan(req.user.id), permissions: PERMISSIONS });
}));

/**
 * @swagger
 * /api/platform/moderators:
 *   get:
 *     summary: "Модераторы и администраторы платформы (только ADMIN)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Список } }
 *   post:
 *     summary: "Назначить модератора по e-mail или имени (только ADMIN)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Назначен } }
 * /api/platform/moderators/{userId}:
 *   delete:
 *     summary: "Снять роль модератора (только ADMIN)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Снята } }
 */
router.get('/platform/moderators', ...adm, wrap(async (_req, res) => res.json(await PlatformRepository.listStaff())));
router.post('/platform/moderators', ...adm, wrap(async (req, res) => {
  res.status(201).json(await PlatformRepository.addModerator(req.user.id, req.body?.identifier));
}));
router.delete('/platform/moderators/:userId', ...adm, wrap(async (req, res) => {
  await PlatformRepository.removeModerator(req.user.id, id(req.params.userId));
  res.json({ message: 'Роль модератора снята' });
}));

// ------------------------------------------------------------------ каталог и библиотека
/**
 * @swagger
 * /api/extensions:
 *   get:
 *     summary: "Каталог одобренных расширений (?q= поиск)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Список } }
 *   post:
 *     summary: "Загрузить расширение: тело запроса — сам .zip. ?dryRun=1 — только проверка без публикации"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Версия отправлена на модерацию }, 422: { description: Пакет не прошёл проверку } }
 */
router.get('/extensions', authMiddleware, wrap(async (req, res) => res.json(await ExtensionRepository.catalog(req.user.id, req.query.q))));

router.post('/extensions', authMiddleware, rawZip, wrap(async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new Error('400: Приложите .zip в теле запроса');
  const ban = await PlatformRepository.getBan(req.user.id);
  if (ban) throw new Error(`403: Вам запрещено публиковать расширения. Причина: ${ban.reason}`);
  const a = await analyzePackage(req.body);
  const report = { ok: a.ok, errors: a.errors, warnings: a.warnings, manifest: a.manifest, size: a.size, files: a.files };
  if (!a.ok) return res.status(422).json(report);
  if (req.query.dryRun) return res.json(report);
  const version = await ExtensionRepository.publish(req.user.id, a, { autoApprove: process.env.EXTENSIONS_AUTO_APPROVE === 'true' });
  res.status(201).json({ ...report, version });
}));

router.get('/extensions/library', authMiddleware, wrap(async (req, res) => res.json(await ExtensionRepository.library(req.user.id))));
router.get('/extensions/mine', authMiddleware, wrap(async (req, res) => res.json(await ExtensionRepository.mine(req.user.id))));

/**
 * @swagger
 * /api/extensions/{extensionId}:
 *   get:
 *     summary: "Карточка расширения (автор и модераторы видят все версии)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Расширение } }
 *   delete:
 *     summary: "Автор удаляет своё расширение целиком"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Удалено } }
 */
router.get('/extensions/:extensionId', authMiddleware, wrap(async (req, res) => {
  const d = await ExtensionRepository.details(id(req.params.extensionId), req.user.id, await PlatformRepository.getRole(req.user.id));
  if (!d) throw new Error('404: Расширение не найдено');
  res.json(d);
}));
router.delete('/extensions/:extensionId', authMiddleware, wrap(async (req, res) => {
  await ExtensionRepository.deleteOwn(id(req.params.extensionId), req.user.id);
  res.json({ message: 'Расширение удалено' });
}));

router.post('/extensions/:extensionId/library', authMiddleware, wrap(async (req, res) => {
  await ExtensionRepository.addToLibrary(req.user.id, id(req.params.extensionId));
  res.status(201).json({ message: 'Добавлено в библиотеку' });
}));
router.delete('/extensions/:extensionId/library', authMiddleware, wrap(async (req, res) => {
  await ExtensionRepository.removeFromLibrary(req.user.id, id(req.params.extensionId));
  res.json({ message: 'Убрано из библиотеки' });
}));
router.post('/extensions/:extensionId/report', authMiddleware, wrap(async (req, res) => {
  await ExtensionRepository.report(id(req.params.extensionId), req.user.id, req.body?.reason);
  res.status(201).json({ message: 'Жалоба отправлена модераторам' });
}));

/**
 * @swagger
 * /api/extensions/versions/{versionId}/preview-token:
 *   post:
 *     summary: "Короткоживущий (10 мин) токен предпросмотра версии для автора и модераторов. Файлы: GET /extp/{token}/{versionId}/{path}"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: "{token}" } }
 */
router.post('/extensions/versions/:versionId/preview-token', authMiddleware, wrap(async (req, res) => {
  const vid = id(req.params.versionId);
  const v = await ExtensionRepository.getVersion(vid);
  if (!v) throw new Error('404: Версия не найдена');
  const role = await PlatformRepository.getRole(req.user.id);
  if (v.author_id !== req.user.id && !role) throw new Error('403: Нет доступа');
  const token = jwt.sign({ typ: 'extpreview', vid }, process.env.JWT_SECRET || 'fallback_secret_key', { expiresIn: '10m' });
  res.json({ token });
}));

// ------------------------------------------------------------------ проект
/**
 * @swagger
 * /api/extensions/projects/{projectId}:
 *   get:
 *     summary: "Расширения проекта (право READ)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Список }  }
 *   post:
 *     summary: "Установить расширение из своей библиотеки в проект и выдать права (право ADMIN). Тело: {extension_id, permissions[]}"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Установлено } }
 * /api/extensions/projects/{projectId}/{extensionId}:
 *   patch:
 *     summary: "Включить/выключить и изменить выданные права (ADMIN). Тело: {enabled?, permissions?}"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Обновлено } }
 *   delete:
 *     summary: "Удалить расширение из проекта (ADMIN)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Удалено } }
 * /api/extensions/projects/{projectId}/{extensionId}/update:
 *   post:
 *     summary: "Обновить до новой одобренной версии; новые права нужно подтвердить в permissions (ADMIN)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Обновлено } }
 * /api/extensions/projects/{projectId}/{extensionId}/audit:
 *   get:
 *     summary: "Журнал обращений расширения к данным проекта (ADMIN)"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Записи } }
 *   post:
 *     summary: "Записать пачку обращений хоста к данным (право READ). Тело: {entries:[{method, ok}]}"
 *     tags: [Extensions]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 204: { description: Записано } }
 */
router.get('/extensions/projects/:projectId', authMiddleware, checkProjectAccess('READ'), wrap(async (req, res) => {
  res.json(await ExtensionRepository.forProject(req.projectId));
}));
router.post('/extensions/projects/:projectId', authMiddleware, checkProjectAccess('ADMIN'), wrap(async (req, res) => {
  await ExtensionRepository.install(req.projectId, req.user.id, id(req.body?.extension_id), req.body?.permissions);
  res.status(201).json({ message: 'Расширение установлено' });
}));
router.patch('/extensions/projects/:projectId/:extensionId', authMiddleware, checkProjectAccess('ADMIN'), wrap(async (req, res) => {
  await ExtensionRepository.patchInstall(req.projectId, id(req.params.extensionId), req.body ?? {});
  res.json({ message: 'Сохранено' });
}));
router.delete('/extensions/projects/:projectId/:extensionId', authMiddleware, checkProjectAccess('ADMIN'), wrap(async (req, res) => {
  await ExtensionRepository.removeInstall(req.projectId, id(req.params.extensionId));
  res.json({ message: 'Расширение удалено из проекта' });
}));
router.post('/extensions/projects/:projectId/:extensionId/update', authMiddleware, checkProjectAccess('ADMIN'), wrap(async (req, res) => {
  await ExtensionRepository.updateInstall(req.projectId, id(req.params.extensionId), req.body?.permissions);
  res.json({ message: 'Расширение обновлено' });
}));
router.get('/extensions/projects/:projectId/:extensionId/audit', authMiddleware, checkProjectAccess('ADMIN'), wrap(async (req, res) => {
  res.json(await ExtensionRepository.auditList(req.projectId, id(req.params.extensionId)));
}));
router.post('/extensions/projects/:projectId/:extensionId/audit', authMiddleware, checkProjectAccess('READ'), wrap(async (req, res) => {
  await ExtensionRepository.recordAudit(req.projectId, id(req.params.extensionId), req.user.id, req.body?.entries);
  res.status(204).end();
}));

// ------------------------------------------------------------------ модерация
/**
 * @swagger
 * /api/moderation/queue:
 *   get:
 *     summary: "Очередь версий на проверку (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Список } }
 * /api/moderation/extensions:
 *   get:
 *     summary: "Все расширения платформы (?q=) (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Список } }
 * /api/moderation/versions/{versionId}/files:
 *   get:
 *     summary: "Список файлов версии и (?path=) текст файла для проверки (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Файлы } }
 * /api/moderation/versions/{versionId}/approve:
 *   post:
 *     summary: "Одобрить версию (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Одобрено } }
 * /api/moderation/versions/{versionId}/reject:
 *   post:
 *     summary: "Отклонить версию, тело {note} (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Отклонено } }
 * /api/moderation/extensions/{extensionId}/remove:
 *   post:
 *     summary: "Удалить расширение со всей платформы, тело {reason} (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Удалено } }
 * /api/moderation/extensions/{extensionId}/restore:
 *   post:
 *     summary: "Восстановить удалённое расширение (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Восстановлено } }
 * /api/moderation/bans:
 *   get:
 *     summary: "Баны авторов расширений (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Список } }
 *   post:
 *     summary: "Забанить автора в части расширений, тело {identifier, reason}. Аккаунт и проекты не затрагиваются (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 201: { description: Забанен } }
 * /api/moderation/bans/{userId}:
 *   delete:
 *     summary: "Снять бан (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Снят } }
 * /api/moderation/reports:
 *   get:
 *     summary: "Жалобы на расширения (?all=1 — вместе с закрытыми) (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Список } }
 * /api/moderation/reports/{reportId}/resolve:
 *   post:
 *     summary: "Закрыть жалобу (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Закрыта } }
 * /api/moderation/log:
 *   get:
 *     summary: "Журнал действий модераторов (MODERATOR)"
 *     tags: [Moderation]
 *     security: [{ bearerAuth: [] }]
 *     responses: { 200: { description: Записи } }
 */
router.get('/moderation/queue', ...mod, wrap(async (_req, res) => res.json(await ExtensionRepository.queue())));
router.get('/moderation/extensions', ...mod, wrap(async (req, res) => res.json(await ExtensionRepository.listAll(req.query.q))));
router.get('/moderation/versions/:versionId/files', ...mod, wrap(async (req, res) => {
  const vid = id(req.params.versionId);
  const v = await ExtensionRepository.getVersion(vid);
  if (!v) throw new Error('404: Версия не найдена');
  if (req.query.path) return res.json({ path: req.query.path, text: await readVersionText(vid, String(req.query.path)) });
  const { listVersionFiles } = await import('../utils/extensionStore.js');
  res.json({ files: await listVersionFiles(vid) });
}));
router.post('/moderation/versions/:versionId/approve', ...mod, wrap(async (req, res) => {
  await ExtensionRepository.review(id(req.params.versionId), req.user.id, true, req.body?.note);
  res.json({ message: 'Версия одобрена' });
}));
router.post('/moderation/versions/:versionId/reject', ...mod, wrap(async (req, res) => {
  await ExtensionRepository.review(id(req.params.versionId), req.user.id, false, req.body?.note);
  res.json({ message: 'Версия отклонена' });
}));
router.post('/moderation/extensions/:extensionId/remove', ...mod, wrap(async (req, res) => {
  await ExtensionRepository.removeByModerator(id(req.params.extensionId), req.user.id, req.body?.reason);
  res.json({ message: 'Расширение удалено' });
}));
router.post('/moderation/extensions/:extensionId/restore', ...mod, wrap(async (req, res) => {
  await ExtensionRepository.restore(id(req.params.extensionId), req.user.id);
  res.json({ message: 'Расширение восстановлено' });
}));
router.get('/moderation/bans', ...mod, wrap(async (_req, res) => res.json(await ExtensionRepository.bans())));
router.post('/moderation/bans', ...mod, wrap(async (req, res) => {
  const u = await ExtensionRepository.ban(req.user.id, req.body?.identifier, req.body?.reason);
  res.status(201).json({ message: `Автор ${u.username} заблокирован в части расширений` });
}));
router.delete('/moderation/bans/:userId', ...mod, wrap(async (req, res) => {
  await ExtensionRepository.unban(req.user.id, id(req.params.userId));
  res.json({ message: 'Бан снят' });
}));
router.get('/moderation/reports', ...mod, wrap(async (req, res) => res.json(await ExtensionRepository.reports(!req.query.all))));
router.post('/moderation/reports/:reportId/resolve', ...mod, wrap(async (req, res) => {
  await ExtensionRepository.resolveReport(id(req.params.reportId), req.user.id);
  res.json({ message: 'Жалоба закрыта' });
}));
router.get('/moderation/log', ...mod, wrap(async (_req, res) => res.json(await PlatformRepository.logList())));

export default router;
