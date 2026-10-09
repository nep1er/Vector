import { Router } from 'express';
import { ProjectRepository } from '../db/ProjectRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

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
 *     summary: Создать новый проект (автоматически создает главную RoadMap)
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
    res.status(500).json({ message: 'Ошибка при получении списка проектов' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) {
      return res.status(400).json({ message: 'Название проекта обязательно' });
    }
    const newProject = await ProjectRepository.createProject(title, description, req.user.id);
    res.status(201).json(newProject);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка при создании проекта' });
  }
});


/**
 * @swagger
 * /api/projects/{projectId}/participants/{userId}:
 *   delete:
 *     summary: Исключить участника из проекта
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
router.delete('/:projectId/participants/:userId', authMiddleware, async (req, res) => {
  try {
    const { projectId, userId } = req.params;
    const removed = await ProjectRepository.removeParticipant(projectId, userId);
    if (!removed) {
      return res.status(404).json({ message: 'Участник не найден в проекте' });
    }
    res.json({ message: 'Участник успешно исключен из проекта', userId });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка при исключении участника' });
  }
});

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Удалить проект по ID
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Проект успешно удален
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await ProjectRepository.deleteProject(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Проект не найден' });
    }
    res.json({ message: 'Проект успешно удален', id: req.params.id });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка при удалении проекта' });
  }
});

/**
 * @swagger
 * /api/projects/{projectId}/participants:
 *   post:
 *     summary: Добавить участника в проект
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
 */
router.post('/:projectId/participants', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const participant = await ProjectRepository.addParticipant(req.params.projectId, userId);
    res.status(201).json(participant);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка добавления участника в проект' });
  }
});

/**
 * @swagger
 * /api/projects/{projectId}:
 *   patch:
 *     summary: Поменять название и/или описание проекта
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
 */
router.patch('/:projectId', authMiddleware, async (req, res) => {
  try {
    const { title, description } = req.body;
    const updated = await ProjectRepository.updateProjectDetails(req.params.projectId, title, description);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления проекта' });
  }
});

export default router;