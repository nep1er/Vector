import { Router } from 'express';
import { DashboardRepository } from '../db/DashboardRepository.js';
import { authMiddleware } from '../middleware/authMiddleware.js';
import { checkProjectAccess } from '../middleware/rbacMiddleware.js';
import { sendError } from '../utils/httpError.js';

const router = Router();

/**
 * @swagger
 * /api/dashboard/projects/{projectId}:
 *   get:
 *     summary: "Дашборд руководителя: статусы задач, просрочки, ближайшие сроки, нагрузка по неделям, карточки, участники, смещения. Право EXECUTE"
 *     tags: [Dashboard]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: projectId, required: true, schema: { type: integer } }
 *     responses:
 *       200:
 *         description: "{tasks, overdue_list, soon_list, weeks, cards, people, todo_progress, shifts}"
 */
router.get('/projects/:projectId', authMiddleware, checkProjectAccess('EXECUTE'), async (req, res) => {
  try {
    res.json(
      await DashboardRepository.forProject(Number(req.params.projectId), {
        userId: req.user.id,
        seeAll: req.userPermissions.includes('ADMIN'),
      })
    );
  } catch (e) {
    sendError(res, e, 'Ошибка построения дашборда');
  }
});

export default router;
