import { Router } from 'express';
import { TagRepository } from '../db/TagRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Tags
 *   description: Управление проектными тегами (метками) и их связями с карточками Канбана
 */

/**
 * @swagger
 * /api/tags/project/{projectId}:
 *   get:
 *     summary: Получить список всех тегов проекта
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID проекта
 *     responses:
 *       200:
 *         description: Массив тегов проекта
 *       500:
 *         description: Ошибка при получении тегов
 *   post:
 *     summary: Создать новый тег в проекте
 *     tags: [Tags]
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
 *                 example: Critical Bug
 *               color:
 *                 type: string
 *                 description: HEX-код цвета тега (по умолчанию #808080)
 *                 example: "#FF0000"
 *     responses:
 *       201:
 *         description: Тег успешно создан
 *       409:
 *         description: Тег с таким названием уже есть в проекте
 */
router.get('/project/:projectId', authMiddleware, async (req, res) => {
  try {
    const tags = await TagRepository.getProjectTags(req.params.projectId);
    res.json(tags);
  } catch (e) {
    sendError(res, e, 'Ошибка получения тегов');
  }
});

router.post('/project/:projectId', authMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Название тега обязательно' });
    }
    const newTag = await TagRepository.createTag(
      req.params.projectId,
      String(name).trim(),
      color || '#808080'
    );
    res.status(201).json(newTag);
  } catch (e) {
    sendError(res, e, 'Ошибка создания тега');
  }
});

/**
 * @swagger
 * /api/tags/apply:
 *   post:
 *     summary: Прикрепить тег к Канбан-карточке
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cardId
 *               - tagId
 *             properties:
 *               cardId:
 *                 type: integer
 *                 example: 1
 *               tagId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Тег успешно привязан к карточке
 *       500:
 *         description: Ошибка при добавлении тега
 */
router.post('/apply', authMiddleware, async (req, res) => {
  try {
    const { cardId, tagId } = req.body;
    const applied = await TagRepository.applyTagToCard(cardId, tagId);
    res.status(201).json(applied ?? { message: 'Тег уже привязан к карточке' });
  } catch (e) {
    sendError(res, e, 'Ошибка добавления тега к карточке');
  }
});

/**
 * @swagger
 * /api/tags/remove-from-card:
 *   delete:
 *     summary: Открепить тег от конкретной карточки Канбана
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cardId
 *               - tagId
 *             properties:
 *               cardId:
 *                 type: integer
 *               tagId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Тег откреплен от карточки
 */
// ВАЖНО: этот маршрут должен идти ДО '/:tagId', иначе Express примет
// слово "remove-from-card" за id тега и вернёт ошибку.
router.delete('/remove-from-card', authMiddleware, async (req, res) => {
  try {
    const { cardId, tagId } = req.body;
    const removed = await TagRepository.removeTagFromCard(cardId, tagId);
    res.json({ message: 'Тег откреплен от карточки', removed });
  } catch (e) {
    sendError(res, e, 'Ошибка открепления тега');
  }
});

/**
 * @swagger
 * /api/tags/{tagId}:
 *   delete:
 *     summary: Удалить тег из проекта полностью
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Тег полностью удален из проекта
 */
router.delete('/:tagId', authMiddleware, async (req, res) => {
  try {
    const deleted = await TagRepository.deleteTag(req.params.tagId);
    if (!deleted) return res.status(404).json({ message: 'Тег не найден' });
    res.json({ message: 'Тег успешно удален из проекта', id: req.params.tagId });
  } catch (e) {
    sendError(res, e, 'Ошибка удаления тега');
  }
});

/**
 * @swagger
 * /api/tags/{tagId}/details:
 *   patch:
 *     summary: Изменить название и/или цвет тега
 *     tags: [Tags]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tagId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "Urgent Fix" }
 *               colorCode: { type: string, example: "#FF5733" }
 *     responses:
 *       200: { description: Тег обновлен }
 */
router.patch('/:tagId/details', authMiddleware, async (req, res) => {
  try {
    const { name, colorCode } = req.body;
    const updated = await TagRepository.updateTagDetails(req.params.tagId, { name, colorCode });
    if (!updated) return res.status(404).json({ message: 'Тег не найден' });
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления тега');
  }
});

export default router;
