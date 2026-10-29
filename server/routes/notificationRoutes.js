import { Router } from 'express';
import { NotificationRepository } from '../db/NotificationRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Уведомления пользователя. Одна таблица на все события - тип (type) + контекст в payload (JSONB)
 */

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: Мои уведомления (новые сверху). Для PROJECT_INVITATION приходит актуальный invitation_status
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: unread, schema: { type: boolean }, description: "true — только непрочитанные" }
 *       - { in: query, name: limit, schema: { type: integer, default: 50 } }
 *       - { in: query, name: offset, schema: { type: integer, default: 0 } }
 *     responses:
 *       200: { description: "Массив {id, type, payload, is_read, created_at, invitation_status}" }
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const unreadOnly = req.query.unread === 'true';
    const folder = ['main', 'hidden', 'all'].includes(req.query.folder) ? req.query.folder : 'main';
    res.json(await NotificationRepository.listForUser(req.user.id, { unreadOnly, limit, offset, folder }));
  } catch (e) {
    sendError(res, e, 'Ошибка получения уведомлений');
  }
});

/**
 * @swagger
 * /api/notifications/unread-count:
 *   get:
 *     summary: Количество непрочитанных уведомлений (для значка на колокольчике)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: "{ count: непрочитанные видимые, hidden: непрочитанные в скрытых }" }
 */
router.get('/unread-count', authMiddleware, async (req, res) => {
  try {
    res.json(await NotificationRepository.countUnread(req.user.id));
  } catch (e) {
    sendError(res, e, 'Ошибка подсчёта уведомлений');
  }
});

/**
 * @swagger
 * /api/notifications/settings:
 *   get:
 *     summary: "Настройки уведомлений: какие категории (INVITES, ROADMAP, TODO, CARD) уходят в «Скрытые»"
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "[{category, hidden}]" }
 *   put:
 *     summary: "Изменить настройки. Тело: {ROADMAP: true, ...} — true = скрывать"
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "[{category, hidden}]" }
 */
router.get('/settings', authMiddleware, async (req, res) => {
  try {
    res.json(await NotificationRepository.getSettings(req.user.id));
  } catch (e) {
    sendError(res, e, 'Ошибка получения настроек');
  }
});

router.put('/settings', authMiddleware, async (req, res) => {
  try {
    res.json(await NotificationRepository.setSettings(req.user.id, req.body));
  } catch (e) {
    sendError(res, e, 'Ошибка сохранения настроек');
  }
});

/**
 * @swagger
 * /api/notifications/read-all:
 *   post:
 *     summary: "Отметить прочитанными все уведомления папки (?folder=main|hidden|all, по умолчанию main)"
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: "{ updated: number }" }
 */
router.post('/read-all', authMiddleware, async (req, res) => {
  try {
    const folder = ['main', 'hidden', 'all'].includes(req.query.folder) ? req.query.folder : 'main';
    res.json({ updated: await NotificationRepository.markAllReadIn(req.user.id, folder) });
  } catch (e) {
    sendError(res, e, 'Ошибка обновления уведомлений');
  }
});

/**
 * @swagger
 * /api/notifications/{notificationId}/read:
 *   patch:
 *     summary: Отметить уведомление прочитанным
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: notificationId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Уведомление обновлено }
 *       404: { description: Уведомление не найдено }
 * /api/notifications/{notificationId}:
 *   delete:
 *     summary: Удалить уведомление
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: notificationId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Уведомление удалено }
 *       404: { description: Уведомление не найдено }
 */
router.patch('/:notificationId/read', authMiddleware, async (req, res) => {
  try {
    const updated = await NotificationRepository.markRead(req.params.notificationId, req.user.id);
    if (!updated) return res.status(404).json({ message: 'Уведомление не найдено' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления уведомления');
  }
});

router.delete('/:notificationId', authMiddleware, async (req, res) => {
  try {
    const removed = await NotificationRepository.remove(req.params.notificationId, req.user.id);
    if (!removed) return res.status(404).json({ message: 'Уведомление не найдено' });
    res.json({ message: 'Уведомление удалено', id: removed.id });
  } catch (e) {
    sendError(res, e, 'Ошибка удаления уведомления');
  }
});

export default router;
