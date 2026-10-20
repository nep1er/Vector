import { Router } from 'express';
import { RoleRepository } from '../db/RoleRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkProjectAccess, checkRoleAccess } from '../middleware/rbacMiddleware.js';
import { sendError } from '../utils/httpError.js';

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
router.get('/project/:projectId', authMiddleware, checkProjectAccess('READ'), async (req, res) => {
  try {
    const roles = await RoleRepository.getProjectRoles(req.params.projectId);
    res.json(roles);
  } catch (e) {
    sendError(res, e, 'Ошибка получения ролей');
  }
});

router.post('/project/:projectId', authMiddleware, checkProjectAccess('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    const role = await RoleRepository.createProjectRole(req.params.projectId, name);
    res.status(201).json(role);
  } catch (e) {
    sendError(res, e, 'Ошибка создания роли');
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
router.post('/:roleId/rights', authMiddleware, checkRoleAccess('ADMIN'), async (req, res) => {
  try {
    const { accessRightId } = req.body;
    const added = await RoleRepository.addRightToRole(req.params.roleId, accessRightId);
    res.status(201).json(added ?? { message: 'Право уже есть у роли' });
  } catch (e) {
    sendError(res, e, 'Ошибка добавления права в роль');
  }
});

router.delete('/:roleId/rights', authMiddleware, checkRoleAccess('ADMIN'), async (req, res) => {
  try {
    const { accessRightId } = req.body;
    const removed = await RoleRepository.removeRightFromRole(req.params.roleId, accessRightId);
    res.json(removed ?? { message: 'У роли не было этого права' });
  } catch (e) {
    sendError(res, e, 'Ошибка отзыва права у роли');
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
// roleId лежит в теле запроса, а не в URL: подставляем его в params для проверки прав
const roleFromBody = (req, res, next) => {
  req.params.roleId = req.body.roleId;
  return checkRoleAccess('ADMIN')(req, res, next);
};

router.post('/assign-to-participant', authMiddleware, roleFromBody, async (req, res) => {
  try {
    const { participantId, roleId } = req.body;
    const role = await RoleRepository.findById(roleId);
    const check = await RoleRepository.participantBelongsToProject(role.project_id, participantId);
    if (!check) return res.status(400).json({ message: 'Участник относится к другому проекту' });
    const assigned = await RoleRepository.assignRoleToParticipant(participantId, roleId);
    res.status(201).json(assigned ?? { message: 'Роль уже назначена' });
  } catch (e) {
    sendError(res, e, 'Ошибка назначения роли участнику');
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
router.patch('/:roleId/name', authMiddleware, checkRoleAccess('ADMIN'), async (req, res) => {
  try {
    const { name } = req.body;
    const updated = await RoleRepository.updateRoleName(req.params.roleId, name);
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления названия роли');
  }
});

/**
 * @swagger
 * /api/roles/access-rights:
 *   get:
 *     summary: Справочник прав доступа (READ, WRITE, EXECUTE, ADMIN) — для настройки ролей
 *     tags: [Roles & RBAC]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "Массив {id, name}"
 */
router.get('/access-rights', authMiddleware, async (req, res) => {
  try {
    res.json(await RoleRepository.getAccessRights());
  } catch (e) {
    sendError(res, e, 'Ошибка получения справочника прав');
  }
});

/**
 * @swagger
 * /api/roles/{roleId}:
 *   delete:
 *     summary: Удалить роль проекта (право ADMIN). Нельзя удалить роль, если после этого в проекте не останется администратора
 *     tags: [Roles & RBAC]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Роль удалена
 *       400:
 *         description: Нельзя удалить последнего администратора
 */
router.delete('/:roleId', authMiddleware, checkRoleAccess('ADMIN'), async (req, res) => {
  try {
    const removed = await RoleRepository.deleteRole(req.params.roleId);
    if (!removed) return res.status(404).json({ message: 'Роль не найдена' });
    res.json({ message: 'Роль удалена', id: removed.id });
  } catch (e) {
    sendError(res, e, 'Ошибка удаления роли');
  }
});

export default router;