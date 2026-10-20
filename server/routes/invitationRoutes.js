import { Router } from 'express';
import { InvitationRepository } from '../db/InvitationRepository.js';
import { UserRepository } from '../db/UserRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Invitations
 *   description: "Мои приглашения в проекты. Приглашения создаются руководством проекта: POST /api/projects/{projectId}/invitations"
 */

/** Полная запись текущего пользователя (в JWT только id и email, а нужен ещё email и username) */
const currentUser = (req) => UserRepository.findById(req.user.id);

/**
 * @swagger
 * /api/invitations:
 *   get:
 *     summary: Мои ожидающие приглашения в проекты
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: "Массив {id, project_id, project_title, inviter_name}" }
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await currentUser(req);
    res.json(await InvitationRepository.listPendingForUser(user));
  } catch (e) {
    sendError(res, e, 'Ошибка получения приглашений');
  }
});

/**
 * @swagger
 * /api/invitations/{invitationId}/accept:
 *   post:
 *     summary: Принять приглашение — пользователь становится участником проекта с ролью «Наблюдатель»
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: invitationId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ id, project_id, status: ACCEPTED }" }
 *       404: { description: Приглашение не найдено }
 *       409: { description: Приглашение уже обработано }
 * /api/invitations/{invitationId}/decline:
 *   post:
 *     summary: Отклонить приглашение
 *     tags: [Invitations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: invitationId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "{ id, project_id, status: DECLINED }" }
 */
router.post('/:invitationId/accept', authMiddleware, async (req, res) => {
  try {
    const user = await currentUser(req);
    res.json(await InvitationRepository.respond(Number(req.params.invitationId), user, true));
  } catch (e) {
    sendError(res, e, 'Ошибка принятия приглашения');
  }
});

router.post('/:invitationId/decline', authMiddleware, async (req, res) => {
  try {
    const user = await currentUser(req);
    res.json(await InvitationRepository.respond(Number(req.params.invitationId), user, false));
  } catch (e) {
    sendError(res, e, 'Ошибка отклонения приглашения');
  }
});

export default router;
