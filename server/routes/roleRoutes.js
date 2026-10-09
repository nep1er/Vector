import { Router } from 'express';
import { RoleRepository } from '../db/RoleRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Roles & RBAC
 *   description: Создание кастомных ролей, настройка их прав доступа и назначение участникам
 */

/**
 * @swagger
 * /api/roles/project/{projectId}:
 *   get:
 *     summary: Получить список всех ролей проекта вместе с их правами доступа
 *     tags: [Roles & RBAC]
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
 *         description: Список ролей и их прав
 *   post:
 *     summary: Создать новую роль в проекте
 *     tags: [Roles & RBAC]
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
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Frontend Developer
 *     responses:
 *       201:
 *         description: Роль создана
 */
router.get('/project/:projectId', authMiddleware, async (req, res) => {
  try {
    const roles = await RoleRepository.getProjectRoles(req.params.projectId);
    res.json(roles);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка получения ролей' });
  }
});

router.post('/project/:projectId', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const role = await RoleRepository.createProjectRole(req.params.projectId, name);
    res.status(201).json(role);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка создания роли' });
  }
});

/**
 * @swagger
 * /api/roles/{roleId}/rights:
 *   post:
 *     summary: Добавить право доступа к роли
 *     tags: [Roles & RBAC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
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
 *               - accessRightId
 *             properties:
 *               accessRightId:
 *                 type: integer
 *                 description: ID права (1 = READ, 2 = WRITE, 3 = EXECUTE, 4 = ADMIN)
 *                 example: 2
 *     responses:
 *       201:
 *         description: Право привязано к роли
 *   delete:
 *     summary: Отозвать право доступа у роли
 *     tags: [Roles & RBAC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
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
 *               - accessRightId
 *             properties:
 *               accessRightId:
 *                 type: integer
 *                 example: 2
 *     responses:
 *       200:
 *         description: Право удалено из роли
 */
router.post('/:roleId/rights', authMiddleware, async (req, res) => {
  try {
    const { accessRightId } = req.body;
    const added = await RoleRepository.addRightToRole(req.params.roleId, accessRightId);
    res.status(201).json(added);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка добавления права в роль' });
  }
});

router.delete('/:roleId/rights', authMiddleware, async (req, res) => {
  try {
    const { accessRightId } = req.body;
    const removed = await RoleRepository.removeRightFromRole(req.params.roleId, accessRightId);
    res.json(removed);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка отзыва права у роли' });
  }
});

/**
 * @swagger
 * /api/roles/assign-to-participant:
 *   post:
 *     summary: Назначить Роль участнику проекта
 *     tags: [Roles & RBAC]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - participantId
 *               - roleId
 *             properties:
 *               participantId:
 *                 type: integer
 *                 example: 1
 *               roleId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Роль успешно назначена участнику
 */
router.post('/assign-to-participant', authMiddleware, async (req, res) => {
  try {
    const { participantId, roleId } = req.body;
    const assigned = await RoleRepository.assignRoleToParticipant(participantId, roleId);
    res.status(201).json(assigned);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка назначения роли участнику' });
  }
});

/**
 * @swagger
 * /api/roles/{roleId}/name:
 *   patch:
 *     summary: Сменить название роли
 *     tags: [Roles & RBAC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Senior Backend Developer" }
 *     responses:
 *       200: { description: Имя роли изменено }
 */
router.patch('/:roleId/name', authMiddleware, async (req, res) => {
  try {
    const { name } = req.body;
    const updated = await RoleRepository.updateRoleName(req.params.roleId, name);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления названия роли' });
  }
});
export default router;