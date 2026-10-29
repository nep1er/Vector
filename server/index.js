import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger.js';

import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import kanbanRoutes from './routes/kanbanRoutes.js';
import roleRoutes from './routes/roleRoutes.js';
import kanbanTagRoutes from './routes/kanbanTagRoutes.js';
import taskTagRoutes from './routes/taskTagRoutes.js';
import invitationRoutes from './routes/invitationRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import { MAX_UPLOAD_MB } from './utils/fileStore.js';
import myTasksRoutes from './routes/myTasksRoutes.js';
import taskShiftRoutes from './routes/taskShiftRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import storageRoutes from './routes/storageRoutes.js';
import friendRoutes from './routes/friendRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Раздаем папку public
app.use('/public', express.static(path.join(__dirname, 'public')));

// Загруженные пользователями файлы (аватарки)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Настройки кастомизации Swagger UI
const customSwaggerOptions = {
  customCssUrl: '/public/custom.css',
  customSiteTitle: 'Vector PM | REST API Documentation',
  customfavIcon: '/public/logo.png', // Твой логотип на вкладке браузера
  swaggerOptions: {
    persistAuthorization: true, // Сохранять JWT при перезагрузке
  },
};

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, customSwaggerOptions));

// Подключение роутов
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/kanban', kanbanRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/kanban-tags', kanbanTagRoutes); // теги Канбана (бывш. /api/tags)
app.use('/api/task-tags', taskTagRoutes); // теги задач RoadMap/ToDo
app.use('/api/invitations', invitationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/my-tasks', myTasksRoutes);
app.use('/api/task-shifts', taskShiftRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/friends', friendRoutes);

// Слишком большой файл — понятный JSON вместо HTML-страницы
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: `Файл слишком большой (максимум ${MAX_UPLOAD_MB} МБ)` });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`🚀 API Сервер запущен на порту ${PORT}`);
  console.log(`📖 Документация API: http://localhost:${PORT}/docs`);
});
