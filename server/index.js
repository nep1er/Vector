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
import tagRoutes from './routes/tagRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Раздаем папку public
app.use('/public', express.static(path.join(__dirname, 'public')));

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
app.use('/api/tags', tagRoutes);

app.listen(PORT, () => {
  console.log(`🚀 API Сервер запущен на порту ${PORT}`);
  console.log(`📖 Документация API: http://localhost:${PORT}/docs`);
});