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

  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: 'Ошибка авторизации: Заголовок Authorization отсутствует' });
    }

    const token = authHeader.split(' ')[1]; // "Bearer <TOKEN>"

    if (!token) {
      return res.status(401).json({ message: 'Ошибка авторизации: Токен не предоставлен' });
    }

    // Расшифровываем токен с помощью секретного ключа из .env
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
    
    // Помещаем декодированные данные (id, email) в объект запроса
    req.user = decoded;
    
    next();
  } catch (error) {
    console.error('JWT Verification Error:', error.message);
    return res.status(403).json({ message: 'Недействительный или просроченный токен авторизации' });
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