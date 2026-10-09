import { RoleRepository } from '../db/RoleRepository.js';

export const checkProjectAccess = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.id;
      const projectId = req.params.projectId || req.body.projectId;

      if (!projectId) {
        return res.status(400).json({ message: 'Не указан ID проекта' });
      }

      const permissions = await RoleRepository.getUserPermissionsInProject(userId, projectId);

      if (!permissions.includes(requiredPermission) && !permissions.includes('ADMIN')) {
        return res.status(403).json({ 
          message: `Отказано в доступе. Требуется право: ${requiredPermission}` 
        });
      }

      req.userPermissions = permissions;
      next();
    } catch (error) {
      res.status(500).json({ message: 'Ошибка проверки прав доступа' });
    }
  };
};