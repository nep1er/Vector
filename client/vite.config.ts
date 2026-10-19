import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Браузер ходит на тот же адрес, что и сайт (localhost:5173),
// а Vite сам пересылает запросы /api на Express-сервер (порт 5000).
// Благодаря этому не нужно возиться с CORS в разработке.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/public': 'http://localhost:5000', // картинки/файлы, раздаваемые сервером
    },
  },
});
