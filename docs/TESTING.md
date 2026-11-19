# Тестирование и покрытие

Цель: сейчас **20 %** покрытия, затем рост до **70 %**, когда затронута каждая подсистема (хотя бы по 2–3 теста на каждую).

## Запуск

| Что | Команда (из папки) | Что делает |
|---|---|---|
| Сервер | `cd server && npm test` | все тесты (`node:test`, без внешних библиотек) |
| Сервер | `cd server && npm run test:coverage` | тесты + отчёт покрытия + **проверка порога 20 %** (строки и ветки) |
| Клиент | `cd client && npm install` | один раз: поставит vitest, jsdom, testing-library |
| Клиент | `cd client && npm test` | все тесты (Vitest + jsdom) |
| Клиент | `cd client && npm run test:coverage` | тесты + отчёт (таблица в консоли, HTML в `client/coverage/`) + проверка порога |

Если покрытие ниже порога — команда завершается с ошибкой (удобно для CI).

## Как считается покрытие

* **Клиент:** `all: true` в `client/vitest.config.ts` — в отчёт попадают **все** файлы `src/`, даже без тестов. Новый компонент автоматически снижает процент, пока для него нет теста.
* **Сервер:** тест `server/tests/loadAll.test.mjs` загружает каждый модуль из `db/`, `middleware/`, `utils/` (и `routes/`, если установлены зависимости), поэтому в знаменатель входит весь код этих папок. В расчёт сейчас включены `db/`, `middleware/`, `utils/`; **`routes/` добавляется на этапе роста** (флаги `--test-coverage-include` в `server/package.json`).

## Что покрыто сейчас

| Система | Файл теста | Что проверяется |
|---|---|---|
| Авторизация (JWT) | `server/tests/authMiddleware.test.mjs` | нет/битый/просроченный/чужой токен → 401, верный токен → `req.user` |
| Права в проекте (RBAC) | `server/tests/rbacMiddleware.test.mjs` | 400/403/404, ADMIN, скрытые задачи и карточки |
| Роли платформы | `server/tests/platformMiddleware.test.mjs` | USER / MODERATOR / ADMIN, сбой БД |
| Ошибки API | `server/tests/httpError.test.mjs` | `Error('409: …')`, коды PostgreSQL → 4xx |
| Файлы и хранилище | `server/tests/fileStore.test.mjs` | имя файла, защита от выхода из папки, сохранение/удаление |
| Картинки | `server/tests/images.test.mjs` | проверка по сигнатуре, а не по Content-Type |
| Смещение сроков | `server/tests/taskShift.test.mjs` | проверка входных параметров |
| Расширения | `server/tests/extensionPackage.test.mjs` | валидатор пакетов, вредоносные архивы |
| Все модули | `server/tests/loadAll.test.mjs` | каждый файл загружается без ошибок |
| Статусы, фильтры | `client/src/utils/status.test.ts` | палитра, `textOn`, `matchesFilters` |
| Даты RoadMap | `client/src/utils/dates.test.ts` | UTC-дни, границы месяца |
| Размеры файлов | `client/src/utils/format.test.ts` | подписи, лимит 25 МБ |
| Права расширений | `client/src/utils/extensions.test.ts` | справочник прав и риски |
| HTTP-клиент | `client/src/api.test.ts` | токен, ошибки, 401 → выход |
| Окна и аватарки | `client/src/components/Modal.test.tsx`, `Avatar.test.tsx` | Esc, клик по фону, `dismissOnBackdrop` |

## Дорожная карта к 70 %

Идти по подсистемам, по 2–3 теста на каждую (сначала «счастливый путь», потом отказ по правам):

1. **Маршруты сервера** (`routes/*`): через `express` + `fetch` на временном порту, репозитории подменять `mock.module` (шаблон — `rbacMiddleware.test.mjs`). Порядок: auth (регистрация, вход, неверный пароль) → projects → tasks → kanban → roles → invitations → notifications → extensions. После этого добавить `routes/**/*.js` в `--test-coverage-include`.
2. **Репозитории** (`db/*`): тесты с фальшивым `pool.query`, проверять текст/параметры SQL и разбор результата.
3. **Клиент:** формы входа/регистрации, `Dropdown`, `KanbanBoard`, `CardModal`, `RoadmapFilters` (`@testing-library/react`, `fetch` мокается как в `api.test.ts`).
4. Поднимать порог: 20 → 35 → 50 → 70 (`--test-coverage-lines=…` на сервере, `thresholds` в `client/vitest.config.ts`).

## Как писать тест

* Сервер: `import test from 'node:test'`; зависимости от БД подменять `mockServerModule('db/XRepository.js', {…})` из `server/tests/helpers/http.mjs`, затем `await import(...)` проверяемого модуля. Для middleware — `run(mw, req)` возвращает `{ res, nextCalled }`.
* Клиент: `import { describe, it, expect, vi } from 'vitest'`; компоненты — `render` из `@testing-library/react`.
* Один файл на систему, имя `<что>.test.mjs` / `<что>.test.ts(x)` рядом с кодом (клиент) или в `server/tests/`.
