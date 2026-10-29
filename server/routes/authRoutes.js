import express, { Router } from 'express';
import bcrypt from 'bcrypt';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { UserRepository } from '../db/UserRepository.js';
import { authMiddleware, generateToken } from '../middleware/authMiddleware.js';
import { sendError } from '../utils/httpError.js';
import { IMAGE_EXT, IMAGE_SIGNATURES } from '../utils/images.js';

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const AVATAR_URL_PREFIX = '/uploads/avatars/';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Удаляет файл аватара с диска, если он был загружен на наш сервер */
async function removeLocalAvatar(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith(AVATAR_URL_PREFIX)) return;
  await fs.unlink(path.join(AVATAR_DIR, path.basename(avatarUrl))).catch(() => {});
}

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Регистрация нового пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               email:
 *                 type: string
 *                 example: admin@vector.ru
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       201:
 *         description: Пользователь создан, возвращён JWT-токен
 *       400:
 *         description: Не все поля заполнены или некорректные данные
 *       409:
 *         description: Email или имя пользователя уже заняты
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.post('/register', async (req, res) => {
  try {
    const username = String(req.body.username ?? '').trim();
    const email = String(req.body.email ?? '').trim();
    const password = String(req.body.password ?? '');

    if (!email || !password || !username) {
      return res.status(400).json({ message: 'Заполните все обязательные поля' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Введите корректный email' });
    }
    if (username.length > 50) {
      return res.status(400).json({ message: 'Имя пользователя — не длиннее 50 символов' });
    }

    const candidate = await UserRepository.findByEmail(email);
    if (candidate) {
      return res.status(409).json({ message: 'Пользователь с таким email уже зарегистрирован' });
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const newUser = await UserRepository.createUser(username, email, hashPassword);
    const token = generateToken(newUser.id, newUser.email);

    return res.status(201).json({ token, user: newUser });
  } catch (error) {
    return sendError(res, error, 'Ошибка при регистрации пользователя');
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Авторизация пользователя
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: admin@vector.ru
 *               password:
 *                 type: string
 *                 example: password123
 *     responses:
 *       200:
 *         description: Успешный вход и получение JWT-токена
 *       400:
 *         description: Неверные учётные данные
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await UserRepository.findByEmail(String(email ?? '').trim());
    if (!user) {
      return res.status(400).json({ message: 'Пользователь не найден' });
    }

    const isPassValid = await bcrypt.compare(String(password ?? ''), user.password_hash);
    if (!isPassValid) {
      return res.status(400).json({ message: 'Введен неверный пароль' });
    }

    const token = generateToken(user.id, user.email);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    return sendError(res, error, 'Ошибка при входе в систему');
  }
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Получить профиль текущего пользователя
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Данные пользователя
 *       401:
 *         description: Токен отсутствует или невалиден
 *       500:
 *         description: Ошибка сервера
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await UserRepository.findById(req.user.id);
    if (!user) return res.status(401).json({ message: 'Пользователь не найден' });
    return res.json(user);
  } catch (error) {
    return sendError(res, error, 'Ошибка получения данных профиля');
  }
});

/**
 * @swagger
 * /api/auth/profile/username:
 *   patch:
 *     summary: Сменить имя пользователя
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username: { type: string, example: "alex_pro" }
 *     responses:
 *       200: { description: Имя изменено }
 *       409: { description: Имя уже занято }
 */
router.patch('/profile/username', authMiddleware, async (req, res) => {
  try {
    const username = String(req.body.username ?? '').trim();
    if (!username) return res.status(400).json({ message: 'Имя не может быть пустым' });
    if (username.length > 50) {
      return res.status(400).json({ message: 'Имя пользователя — не длиннее 50 символов' });
    }
    const updated = await UserRepository.updateUsername(req.user.id, username);
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления имени');
  }
});

/**
 * @swagger
 * /api/auth/profile/email:
 *   patch:
 *     summary: Сменить почту пользователя
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: "new_email@vector.ru" }
 *     responses:
 *       200: { description: Email изменен }
 *       409: { description: Email уже используется }
 */
router.patch('/profile/email', authMiddleware, async (req, res) => {
  try {
    const email = String(req.body.email ?? '').trim();
    if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Введите корректный email' });

    const owner = await UserRepository.findByEmail(email);
    if (owner && owner.id !== req.user.id) {
      return res.status(409).json({ message: 'Этот email уже используется' });
    }
    const updated = await UserRepository.updateEmail(req.user.id, email);
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления почты');
  }
});

/**
 * @swagger
 * /api/auth/profile/password:
 *   patch:
 *     summary: Сменить пароль пользователя
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword: { type: string, example: "password123" }
 *               newPassword: { type: string, example: "new_secret_password" }
 *     responses:
 *       200: { description: Пароль изменен }
 *       400: { description: Старый пароль введён неверно }
 */
router.patch('/profile/password', authMiddleware, async (req, res) => {
  try {
    const oldPassword = String(req.body.oldPassword ?? '');
    const newPassword = String(req.body.newPassword ?? '');
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Новый пароль — не короче 6 символов' });
    }

    // Ищем по id, а не по email из токена: после смены почты токен хранит старый email
    const user = await UserRepository.findByIdWithPassword(req.user.id);
    if (!user) return res.status(401).json({ message: 'Пользователь не найден' });

    const isValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isValid) return res.status(400).json({ message: 'Текущий пароль введён неверно' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await UserRepository.updatePassword(req.user.id, newHash);
    res.json({ message: 'Пароль успешно обновлён' });
  } catch (e) {
    sendError(res, e, 'Ошибка смены пароля');
  }
});

/**
 * @swagger
 * /api/auth/profile/avatar:
 *   patch:
 *     summary: Задать аватарку ссылкой (пустая строка — удалить аватарку)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [avatarUrl]
 *             properties:
 *               avatarUrl: { type: string, example: "https://example.com/avatars/user1.png" }
 *     responses:
 *       200: { description: Аватарка обновлена }
 */
router.patch('/profile/avatar', authMiddleware, async (req, res) => {
  try {
    const avatarUrl = String(req.body.avatarUrl ?? '').trim();
    if (avatarUrl.length > 512) {
      return res.status(400).json({ message: 'Ссылка слишком длинная' });
    }
    const previous = await UserRepository.findById(req.user.id);
    const updated = await UserRepository.updateAvatar(req.user.id, avatarUrl);
    if (previous?.avatar_url !== updated?.avatar_url) await removeLocalAvatar(previous?.avatar_url);
    res.json(updated);
  } catch (e) {
    sendError(res, e, 'Ошибка обновления аватарки');
  }
});

/**
 * @swagger
 * /api/auth/profile/avatar/upload:
 *   post:
 *     summary: Загрузить файл аватарки (тело запроса — сама картинка PNG/JPEG/WebP до 2 МБ)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         image/png:
 *           schema: { type: string, format: binary }
 *         image/jpeg:
 *           schema: { type: string, format: binary }
 *         image/webp:
 *           schema: { type: string, format: binary }
 *     responses:
 *       200: { description: Аватарка загружена, возвращён обновлённый профиль }
 *       400: { description: Файл не является допустимой картинкой }
 */
router.post(
  '/profile/avatar/upload',
  authMiddleware,
  express.raw({ type: Object.keys(IMAGE_EXT), limit: '2mb' }),
  async (req, res) => {
    try {
      const type = (req.headers['content-type'] ?? '').split(';')[0].trim();
      const body = req.body;

      if (!Buffer.isBuffer(body) || body.length === 0 || !IMAGE_SIGNATURES[type]?.(body)) {
        return res.status(400).json({ message: 'Загрузите изображение PNG, JPEG или WebP до 2 МБ' });
      }

      await fs.mkdir(AVATAR_DIR, { recursive: true });
      const fileName = `${req.user.id}-${Date.now()}.${IMAGE_EXT[type]}`;
      await fs.writeFile(path.join(AVATAR_DIR, fileName), body);

      const previous = await UserRepository.findById(req.user.id);
      const updated = await UserRepository.updateAvatar(req.user.id, AVATAR_URL_PREFIX + fileName);
      await removeLocalAvatar(previous?.avatar_url);

      res.json(updated);
    } catch (e) {
      sendError(res, e, 'Ошибка загрузки аватарки');
    }
  }
);

/**
 * @swagger
 * /api/auth/account:
 *   delete:
 *     summary: Удалить свой аккаунт из системы
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Аккаунт успешно удален }
 */
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const user = await UserRepository.findById(req.user.id);
    await UserRepository.deleteUser(req.user.id);
    await removeLocalAvatar(user?.avatar_url);
    res.json({ message: 'Ваш аккаунт и все связанные записи успешно удалены' });
  } catch (e) {
    sendError(res, e, 'Ошибка при удалении аккаунта');
  }
});

export default router;
