import jwt from 'jsonwebtoken';

/**
 * Middleware для проверки JWT-токена авторизации.
 * Ожидает заголовок вида: Authorization: Bearer <TOKEN>
 */
export const authMiddleware = (req, res, next) => {
  // Игнорируем OPTIONS-запросы от браузера (CORS preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: 'Ошибка авторизации: Заголовок Authorization отсутствует' });
  }

  const token = authHeader.split(' ')[1]; // "Bearer <TOKEN>"
  if (!token) {
    return res.status(401).json({ message: 'Ошибка авторизации: Токен не предоставлен' });
  }

  try {
    // Расшифровываем токен с помощью секретного ключа из .env
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    next();
  } catch (error) {
    console.error('JWT Verification Error:', error.message);
    // 401 — токен недействителен или просрочен: клиент должен войти заново.
    // (403 теперь означает только «нет прав на действие»)
    return res.status(401).json({ message: 'Недействительный или просроченный токен авторизации' });
  }
};

/**
 * Вспомогательная функция для генерации JWT-токена
 */
export const generateToken = (id, email) => {
  return jwt.sign(
    { id, email },
    process.env.JWT_SECRET || 'fallback_secret_key',
    { expiresIn: '24h' }
  );
};
