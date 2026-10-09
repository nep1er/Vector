import { Router } from 'express';
import bcrypt from 'bcrypt';
import { UserRepository } from '../db/UserRepository.js';
import { authMiddleware, generateToken } from '../middleware/authMiddleware.js';

const router = Router();

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
 *         description: Не все поля заполнены или email занят
 *       500:
 *         description: Внутренняя ошибка сервера
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ message: 'Заполните все обязательные поля' });
    }

    const candidate = await UserRepository.findByEmail(email);
    if (candidate) {
      return res.status(400).json({ message: 'Пользователь с таким email уже зарегистрирован' });
    }

    const hashPassword = await bcrypt.hash(password, 10);
    const newUser = await UserRepository.createUser(username, email, hashPassword);
    const token = generateToken(newUser.id, newUser.email);

    return res.status(201).json({ token, user: newUser });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при регистрации пользователя' });
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

    const user = await UserRepository.findByEmail(email);
    if (!user) {
      return res.status(400).json({ message: 'Пользователь не найден' });
    }

    const isPassValid = await bcrypt.compare(password, user.password_hash);
    if (!isPassValid) {
      return res.status(400).json({ message: 'Введен неверный пароль' });
    }

    const token = generateToken(user.id, user.email);

    return res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Ошибка при входе в систему' });
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
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: 'Ошибка получения данных профиля' });
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
 */
router.patch('/profile/username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    const updated = await UserRepository.updateUsername(req.user.id, username);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления имени' });
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
 */
router.patch('/profile/email', authMiddleware, async (req, res) => {
  try {
    const { email } = req.body;
    const updated = await UserRepository.updateEmail(req.user.id, email);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления почты' });
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
 */
router.patch('/profile/password', authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const user = await UserRepository.findByEmail(req.user.email);
    
    const isValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isValid) return res.status(400).json({ message: 'Старый пароль введён неверно' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await UserRepository.updatePassword(req.user.id, newHash);
    res.json({ message: 'Пароль успешно обновлён' });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка смены пароля' });
  }
});

/**
 * @swagger
 * /api/auth/profile/avatar:
 *   patch:
 *     summary: Сменить URL аватарки пользователя
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
    const { avatarUrl } = req.body;
    const updated = await UserRepository.updateAvatar(req.user.id, avatarUrl);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: 'Ошибка обновления аватарки' });
  }
});

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
    await UserRepository.deleteUser(req.user.id);
    res.json({ message: 'Ваш аккаунт и все связанные записи успешно удалены' });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка при удалении аккаунта' });
  }
});

export default router;