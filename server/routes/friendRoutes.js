import { Router } from 'express';
import { FriendRepository } from '../db/FriendRepository.js';
import { UserRepository } from '../db/UserRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Friends
 *   description: "Друзья. Статусы: PENDING (ожидает подтверждения) и ACCEPTED (в друзьях). Отклонение заявки = удаление записи."
 */

/**
 * @swagger
 * /api/friends:
 *   get:
 *     summary: Мои друзья и заявки (direction INCOMING - мне прислали, OUTGOING - я отправил)
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Массив записей с данными второго пользователя }
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    res.json(await FriendRepository.listForUser(req.user.id));
  } catch (e) {
    sendError(res, e, 'Ошибка получения списка друзей');
  }
});

/**
 * @swagger
 * /api/friends/requests:
 *   post:
 *     summary: Отправить заявку в друзья (по userId, email или имени пользователя)
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: integer }
 *               identifier: { type: string, example: "pm@vector.ru" }
 *     responses:
 *       201: { description: Заявка отправлена, адресату создано уведомление FRIEND_REQUEST }
 *       404: { description: Пользователь не найден }
 *       409: { description: Заявка или дружба уже существует }
 */
router.post('/requests', authMiddleware, async (req, res) => {
  try {
    const requester = await UserRepository.findById(req.user.id);
    const { userId, identifier } = req.body;
    res.status(201).json(await FriendRepository.sendRequest(requester, { userId, identifier }));
  } catch (e) {
    sendError(res, e, 'Ошибка отправки заявки');
  }
});

/**
 * @swagger
 * /api/friends/{friendId}/accept:
 *   post:
 *     summary: Принять заявку (только адресат)
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: friendId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Теперь вы друзья }
 *       404: { description: Заявка не найдена }
 * /api/friends/{friendId}:
 *   delete:
 *     summary: Отклонить заявку / отозвать свою / убрать из друзей (запись удаляется)
 *     tags: [Friends]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: friendId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Запись удалена }
 *       404: { description: Запись не найдена }
 */
router.post('/:friendId/accept', authMiddleware, async (req, res) => {
  try {
    const user = await UserRepository.findById(req.user.id);
    const accepted = await FriendRepository.accept(Number(req.params.friendId), user);
    if (!accepted) return res.status(404).json({ message: 'Заявка не найдена' });
    res.json(accepted);
  } catch (e) {
    sendError(res, e, 'Ошибка принятия заявки');
  }
});

router.delete('/:friendId', authMiddleware, async (req, res) => {
  try {
    const removed = await FriendRepository.remove(Number(req.params.friendId), req.user.id);
    if (!removed) return res.status(404).json({ message: 'Запись не найдена' });
    res.json({ message: 'Запись удалена', id: removed.id });
  } catch (e) {
    sendError(res, e, 'Ошибка удаления записи');
  }
});

export default router;
