import { Router } from 'express';
import { InvitationRepository } from '../db/InvitationRepository.js';
import { ProjectRepository } from '../db/ProjectRepository.js';
import { RoleRepository } from '../db/RoleRepository.js';
import { UserRepository } from '../db/UserRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkProjectAccess } from '../middleware/rbacMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Projects
 *   description: Управление проектами
 */

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Получить список проектов текущего пользователя
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Список проектов
 *   post:
 *     summary: Создать новый проект (автоматически создает главную RoadMap и стандартные роли)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: Новый проект 2026
 *               description:
 *                 type: string
 *                 example: Описание архитектуры и REST API
 *     responses:
 *       201:
 *         description: Проект успешно создан
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const projects = await ProjectRepository.getUserProjects(req.user.id);
    res.json(projects);
  } catch (e) {
    sendError(res, e, 'Ошибка при получении списка проектов');
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const title = String(req.body.title ?? '').trim();
    const description = req.body.description ? String(req.body.description).trim() : null;
    if (!title) {
      return res.status(400).json({ message: 'Название проекта обязательно' });
    }
    if (title.length > 150) {
      return res.status(400).json({ message: 'Название проекта — не длиннее 150 символов' });
    }
    const newProject = await ProjectRepository.createProject(title, description, req.user.id);
    res.status(201).json(newProject);
  } catch (e) {
    sendError(res, e, 'Ошибка при создании проекта');
  }
});

/**
 * @swagger
 * /api/projects/{projectId}:
 *   get:
 *     summary: Получить проект и права текущего пользователя в нём
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Проект с полем permissions (READ, WRITE, EXECUTE, ADMIN)
 *       403:
 *         description: Нет доступа к проекту
 *       404:
 *         description: Проект не найден
 *   patch:
 *     summary: Поменять название и/или описание проекта (право ADMIN)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, example: "Новое имя проекта" }
 *               description: { type: string, example: "Новое описание" }
 *     responses:
 *       200: { description: Проект обновлен }
 *   delete:
 *     summary: Удалить проект вместе со всеми задачами (право ADMIN)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Проект успешно удален
 *       403:
 *         description: Недостаточно прав
 */
router.get('/:projectId', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    const project = await ProjectRepository.findById(req.params.projectId);
    if (!project) return res.status(404).json({ message: 'Проект не найден' });
    res.json({ ...project, permissions: req.userPermissions });
  } catch (e) {
    sendError(res, e, 'Ошибка получения проекта');
  }
});

router.patch('/:projectId', authMiddleware, checkProjectAccess('ADMIN'), async (req, res) => {
  try {
    const title = req.body.title !== undefined ? String(req.body.title).trim() : null;
    const description = req.body.description !== undefined ? String(req.body.description).trim() : null;
    if (title !== null && !title) {
      return res.status(400).json({ message: 'Название проекта не может быть пустым' });
    }
    const updated = await ProjectRepository.updateProjectDetails(req.params.projectId, title, description);
    if (!updated) return res.status(404).json({ message: 'Проект не найден' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления проекта');
  }
});

router.delete('/:projectId', authMiddleware, checkProjectAccess('ADMIN'), async (req, res) => {
  try {
    const deleted = await ProjectRepository.deleteProject(req.params.projectId);
    if (!deleted) {
      return res.status(404).json({ message: 'Проект не найден' });
    }
    res.json({ message: 'Проект успешно удален', id: req.params.projectId });
  } catch (e) {
    sendError(res, e, 'Ошибка при удалении проекта');
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/participants:
 *   post:
 *     summary: Добавить участника в проект напрямую, без приглашения (право ADMIN). Получает роль «Наблюдатель». Сайт использует приглашения — см. /invitations
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       201:
 *         description: Участник добавлен в проект
 *       409:
 *         description: Пользователь уже участвует в проекте
 */
router.post('/:projectId/participants', authMiddleware, checkProjectAccess('ADMIN'), async (req, res) => {
  try {
    const { userId } = req.body;
    const participant = await ProjectRepository.addParticipant(req.params.projectId, userId);
    res.status(201).json(participant);
  } catch (e) {
    sendError(res, e, 'Ошибка добавления участника в проект');
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/leave:
 *   post:
 *     summary: "Покинуть проект самостоятельно (любой участник). Единственный администратор выйти не может — сначала назначьте другого"
 *     tags: [Projects]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Вы покинули проект }
 *       400: { description: Вы единственный администратор }
 */
router.post('/:projectId/leave', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    await ProjectRepository.leave(Number(req.params.projectId), req.user.id);
    res.json({ message: 'Вы покинули проект' });
  } catch (e) {
    sendError(res, e, 'Ошибка выхода из проекта');
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/participants/{userId}:
 *   delete:
 *     summary: Исключить участника из проекта (право ADMIN)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Участник исключен из проекта
 */
router.delete(
  '/:projectId/participants/:userId',
  authMiddleware,
  checkProjectAccess('ADMIN'),
  async (req, res) => {
    try {
      const { projectId, userId } = req.params;
      const removed = await ProjectRepository.removeParticipant(projectId, userId);
      if (!removed) {
        return res.status(404).json({ message: 'Участник не найден в проекте' });
      }
      res.json({ message: 'Участник успешно исключен из проекта', userId });
    } catch (e) {
      sendError(res, e, 'Ошибка при исключении участника');
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/participants:
 *   get:
 *     summary: Участники проекта с их ролями (право READ) — для панели аватарок и вкладки «Участники»
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: "Массив {participant_id, user_id, username, email, avatar_url, roles: [{id, name}]}"
 */
router.get('/:projectId/participants', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    res.json(await ProjectRepository.getParticipants(req.params.projectId));
  } catch (e) {
    sendError(res, e, 'Ошибка получения участников');
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/participants/{userId}/role:
 *   patch:
 *     summary: Сменить роль участника — заменяет ВСЕ его роли одной выбранной (право ADMIN). Для нескольких ролей используйте POST/DELETE .../roles
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *       - { in: path, name: userId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId]
 *             properties:
 *               roleId: { type: integer, example: 2 }
 *     responses:
 *       200: { description: Роль изменена }
 *       400: { description: Нельзя снять права у последнего администратора }
 *       404: { description: Участник или роль не найдены }
 */
router.patch(
  '/:projectId/participants/:userId/role',
  authMiddleware,
  checkProjectAccess('ADMIN'),
  async (req, res) => {
    try {
      const { projectId, userId } = req.params;
      const roleId = Number(req.body.roleId);
      if (!Number.isInteger(roleId)) return res.status(400).json({ message: 'Укажите roleId' });

      const participants = await ProjectRepository.getParticipants(projectId);
      const participant = participants.find((p) => p.user_id === Number(userId));
      if (!participant) return res.status(404).json({ message: 'Участник не найден в проекте' });

      await RoleRepository.setParticipantRole(Number(projectId), participant.participant_id, roleId);
      res.json({ message: 'Роль участника изменена', userId: Number(userId), roleId });
    } catch (e) {
      sendError(res, e, 'Ошибка смены роли участника');
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/invitations:
 *   post:
 *     summary: Пригласить в проект (право ADMIN). Приглашённый получает уведомление PROJECT_INVITATION; при принятии становится «Наблюдателем»
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               identifier: { type: string, example: "dev@vector.ru", description: "email или имя пользователя" }
 *               userId: { type: integer, description: "Вместо identifier" }
 *     responses:
 *       201: { description: Приглашение отправлено }
 *       404: { description: Пользователь не найден }
 *       409: { description: Уже участник или приглашение уже отправлено }
 *   get:
 *     summary: Приглашения проекта, ожидающие ответа (право ADMIN)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Массив приглашений }
 */
router.post('/:projectId/invitations', authMiddleware, checkProjectAccess('ADMIN'), async (req, res) => {
  try {
    const inviter = await UserRepository.findById(req.user.id);
    const { identifier, userId } = req.body;
    const invitation = await InvitationRepository.create(Number(req.params.projectId), inviter, {
      identifier,
      userId,
    });
    res.status(201).json(invitation);
  } catch (e) {
    sendError(res, e, 'Ошибка отправки приглашения');
  }
});

router.get('/:projectId/invitations', authMiddleware, checkProjectAccess('ADMIN'), async (req, res) => {
  try {
    res.json(await InvitationRepository.listPendingForProject(req.params.projectId));
  } catch (e) {
    sendError(res, e, 'Ошибка получения приглашений');
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/invitations/{invitationId}:
 *   delete:
 *     summary: Отозвать приглашение (право ADMIN)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *       - { in: path, name: invitationId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: Приглашение отозвано }
 *       404: { description: Приглашение не найдено или уже обработано }
 */
router.delete(
  '/:projectId/invitations/:invitationId',
  authMiddleware,
  checkProjectAccess('ADMIN'),
  async (req, res) => {
    try {
      const cancelled = await InvitationRepository.cancel(
        Number(req.params.projectId),
        Number(req.params.invitationId)
      );
      if (!cancelled) {
        return res.status(404).json({ message: 'Приглашение не найдено или уже обработано' });
      }
      res.json({ message: 'Приглашение отозвано', id: cancelled.id });
    } catch (e) {
      sendError(res, e, 'Ошибка отзыва приглашения');
    }
  }
);

/**
 * @swagger
 * /api/projects/{projectId}/participants/{userId}/roles:
 *   post:
 *     summary: Добавить участнику ещё одну роль (ролей может быть несколько, права объединяются) — право ADMIN
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *       - { in: path, name: userId, required: true, schema: { type: integer } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleId]
 *             properties:
 *               roleId: { type: integer, example: 3 }
 *     responses:
 *       201: { description: "Итоговый список ролей участника [{id, name}]" }
 *       404: { description: Участник или роль не найдены }
 * /api/projects/{projectId}/participants/{userId}/roles/{roleId}:
 *   delete:
 *     summary: Снять роль с участника (должна остаться хотя бы одна роль, а в проекте — администратор) — право ADMIN
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *       - { in: path, name: userId, required: true, schema: { type: integer } }
 *       - { in: path, name: roleId, required: true, schema: { type: integer } }
 *     responses:
 *       200: { description: "Итоговый список ролей участника" }
 *       400: { description: Нельзя снять последнюю роль или единственного администратора }
 */
router.post(
  '/:projectId/participants/:userId/roles',
  authMiddleware,
  checkProjectAccess('ADMIN'),
  async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const roleId = Number(req.body.roleId);
      if (!Number.isInteger(roleId)) return res.status(400).json({ message: 'Укажите roleId' });
      const participantId = await RoleRepository.participantIdByUser(projectId, Number(req.params.userId));
      if (!participantId) return res.status(404).json({ message: 'Участник не найден в проекте' });
      res.status(201).json(await RoleRepository.addRoleToParticipant(projectId, participantId, roleId));
    } catch (e) {
      sendError(res, e, 'Ошибка добавления роли участнику');
    }
  }
);

router.delete(
  '/:projectId/participants/:userId/roles/:roleId',
  authMiddleware,
  checkProjectAccess('ADMIN'),
  async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const roleId = Number(req.params.roleId);
      if (!Number.isInteger(roleId)) return res.status(400).json({ message: 'Некорректный ID роли' });
      const participantId = await RoleRepository.participantIdByUser(projectId, Number(req.params.userId));
      if (!participantId) return res.status(404).json({ message: 'Участник не найден в проекте' });
      res.json(await RoleRepository.removeRoleFromParticipant(projectId, participantId, roleId));
    } catch (e) {
      sendError(res, e, 'Ошибка снятия роли с участника');
    }
  }
);

export default router;
