import { Router } from 'express';
import { ProjectRepository } from '../db/ProjectRepository.js';
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
 *     summary: Добавить участника в проект (право ADMIN)
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

export default router;
