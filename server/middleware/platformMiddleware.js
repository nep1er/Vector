import { PlatformRepository } from '../db/PlatformRepository.js';

/** Нужна глобальная роль: 'MODERATOR' (подходит и ADMIN) или 'ADMIN'. Используется после authMiddleware. */
export const requirePlatformRole = (min) => async (req, res, next) => {
  try {
    const role = await PlatformRepository.getRole(req.user.id);
    const ok = role === 'ADMIN' || (min === 'MODERATOR' && role === 'MODERATOR');
    if (!ok) return res.status(403).json({ message: 'Недостаточно прав' });
    req.platformRole = role;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Ошибка проверки прав' });
  }
};
