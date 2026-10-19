import { RoleRepository } from '../db/RoleRepository.js';
import { TaskRepository } from '../db/TaskRepository.js';

/**
 * Проверяет, что у пользователя есть право `requiredPermission` в проекте.
 * Право ADMIN даёт доступ ко всему. Права складываются в req.userPermissions.
 */
async function authorize(req, res, next, projectId, requiredPermission) {
  try {
    const id = Number(projectId);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ message: 'Некорректный ID проекта' });
    }

    const permissions = await RoleRepository.getUserPermissionsInProject(req.user.id, id);

    if (!permissions.includes(requiredPermission) && !permissions.includes('ADMIN')) {
      return res.status(403).json({
        message:
          permissions.length === 0
            ? 'Нет доступа к проекту'
            : `Недостаточно прав. Требуется право: ${requiredPermission}`,
      });
    }

    req.userPermissions = permissions;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка проверки прав доступа' });
  }
}

/** Для маршрутов вида /projects/:projectId/... */
export const checkProjectAccess = (requiredPermission) => (req, res, next) =>
  authorize(req, res, next, req.params.projectId ?? req.body?.projectId, requiredPermission);

/** Для маршрутов вида /tasks/:taskId/... — проект определяется по задаче */
export const checkTaskAccess = (requiredPermission) => async (req, res, next) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ message: 'Некорректный ID задачи' });
    }
    const task = await TaskRepository.findById(taskId);
    if (!task) return res.status(404).json({ message: 'Задача не найдена' });
    return authorize(req, res, next, task.project_id, requiredPermission);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Ошибка проверки прав доступа' });
  }
};
