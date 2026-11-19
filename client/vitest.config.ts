import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Тесты клиента: jsdom вместо браузера, покрытие считается по ВСЕМ файлам src (all: true),
// поэтому новые файлы автоматически попадают в отчёт, даже если для них ещё нет тестов.
export default defineConfig({
  plugins: [react()],
  // Иконки лежат в ../resources (как и в vite.config.ts) — разрешаем читать их из тестов
  server: { fs: { allow: ['..'] } },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/types.ts', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'text', 'html'],
      // Порог растёт вместе с проектом. Стартовое значение выбрано по оценке (замеряйте: npm run test:coverage) —
      // после первого запуска поднимите до реального уровня, затем двигайтесь к 20 % → 70 % (см. docs/TESTING.md)
      thresholds: { lines: 10, statements: 10, functions: 10, branches: 10 },
    },
  },
});
