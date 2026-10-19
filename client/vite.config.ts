import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Браузер ходит на тот же адрес, что и сайт (localhost:5173),
// а Vite пересылает запросы на Express-сервер (порт 5000).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Папка resources лежит рядом с client — разрешаем Vite читать файлы на уровень выше
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:5000',
      '/public': 'http://localhost:5000',
      '/uploads': 'http://localhost:5000', // загруженные аватарки
    },
  },
});
