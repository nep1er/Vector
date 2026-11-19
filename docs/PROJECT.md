# Документация проекта Vector

Vector — веб-приложение для планирования хода разработки проектов. В одном проекте совмещены:

* **RoadMap** — план на временной шкале: этапы и задачи с датами, вложенность, статусы, теги;
* **ToDo + Канбан** — доска с колонками и карточками для текущей работы внутри этапа;
* **Команда и права** — участники, роли, видимость задач по ролям, приглашения, друзья, уведомления;
* **Хранилища** — файлы и ссылки проекта;
* **Дашборд и «Задачи»** — сводки для руководителя и личный список дел;
* **Расширения** — сторонние мини-приложения в песочнице (отдельный документ: [EXTENSIONS_GUIDE.md](EXTENSIONS_GUIDE.md)).

Документ объясняет, **для чего каждая часть и как работает**. Для защиты проекта читайте разделы 1–4, для доработок — 5–9.

---

## 1. Технологии и запуск

| Слой | Технологии |
|---|---|
| Клиент (`client/`) | React 19, TypeScript, Vite, react-router-dom 7. Стили — один `styles.css` + дизайн-токены |
| Сервер (`server/`) | Node.js, Express 5 (ES-модули), `pg` (PostgreSQL), `jsonwebtoken`, `bcrypt`, `swagger-ui-express` |
| БД | PostgreSQL. Схема — `VectorDataBase.sql` + миграции `server/db/migrations/001…011` |
| Общие ресурсы (`resources/`) | `design/tokens.json` (цвета, радиусы, шрифты), `icons/*.svg`, `brand/logo.png` |
| Расширения (`extensions/`) | SDK и два примера |

### Переменные окружения (`server/.env`)

| Переменная | Назначение |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | подключение к PostgreSQL |
| `JWT_SECRET` | секрет подписи токенов |
| `PORT` | порт API (по умолчанию 5000) |
| `STORAGE_DIR` | где хранить загруженные файлы (по умолчанию `server/storage`) |
| `PLATFORM_ADMIN_EMAILS` | e-mail администраторов платформы расширений |
| `EXTENSIONS_AUTO_APPROVE=true` | только для разработки: расширения одобряются без модератора |
| `CLIENT_ORIGIN` | адрес сайта (для CSP расширений) |

Клиент: `VITE_API_URL` (адрес API, по умолчанию тот же origin), `VITE_EXT_URL` (origin файлов расширений).

### Запуск

```
cd server && npm install && npm start      # API на :5000, Swagger — http://localhost:5000/docs
cd client && npm install && npm run dev    # сайт на :5173, Vite проксирует /api, /ext, /uploads на :5000
```

Первичная заготовка данных — `server/seed.js`. Миграции применяются вручную в pgAdmin по порядку номеров (каждая идемпотентна).

---

## 2. Архитектура

```
Браузер ── React SPA ──(fetch + JWT)──► Express ──► Routes ──► Repositories ──► PostgreSQL
              │                            │          (HTTP)     (SQL)
              │                            ├─ middleware: authMiddleware, rbacMiddleware
              │                            └─ utils: fileStore, extensionPackage, httpError …
              └─ iframe-песочница расширений ◄──► postMessage-мост
```

Три слоя на сервере:

1. **Routes** (`server/routes/*Routes.js`) — принимают HTTP-запрос, проверяют права (middleware), валидируют вход, вызывают репозиторий, формируют ответ. Каждый маршрут описан Swagger-комментарием (`/docs`).
2. **Repositories** (`server/db/*Repository.js`) — вся работа с SQL. Статические методы класса, один класс на область (`TaskRepository`, `KanbanRepository`…). Многошаговые операции выполняются **в транзакции**.
3. **Middleware** — сквозные проверки: кто вы (JWT) и что вам можно (RBAC).

Ошибки: репозитории бросают `Error('409: текст')` — число в начале это HTTP-код; `utils/httpError.js → sendError()` превращает это в ответ `{message}` и подменяет технические нарушения ограничений БД понятными сообщениями.

На клиенте: `api.ts` — единственное место, где знают URL сервера; страницы (`pages/`) собирают экран из компонентов (`components/`); глобальное состояние только два контекста — пользователь и тема.

---

## 3. Модель данных

### 3.1 Основные таблицы

| Таблица | Назначение |
|---|---|
| `users` | аккаунты: `username` и `email` уникальны (без учёта регистра), `password_hash` (bcrypt), `avatar_url` |
| `project` | проект: название, описание |
| `project_participants` | участие пользователя в проекте (уникальная пара `project_id + user_id`) |
| `project_roles` | роли проекта (уникальны по названию внутри проекта) |
| `access_rights` | справочник прав: `READ`, `WRITE`, `EXECUTE`, `ADMIN` |
| `role_access_rights` | какие права у роли |
| `assigned_roles` | какие роли у участника (у участника может быть несколько) |
| `task` | **единая таблица задач**: `type` (`ROADMAP`/`TODO`), `title`, даты, `parent_roadmap_id`, `status_id` |
| `roadmap_task`, `todo_task` | подтип-«расширения» таблицы `task` (1:1 по `task_id`, тип проверяется составным внешним ключом) |
| `task_status` | справочник: 1 Выполнено, 2 В процессе, 3 В плане, 4 Просрочено, 5 Заморожено, 6 Неактивно |
| `task_tag`, `task_tag_applies` | теги **задач** RoadMap/ToDo (с цветом) |
| `task_role_visibility` | какие роли видят задачу (нет строк — видна всем) |
| `kanban_column` | колонки доски ToDo-задачи (название, позиция, цвет) |
| `kanban_card` | карточки: колонка, название, описание, `work_date`, позиция, статус |
| `kanban_tag`, `kanban_tags_applies` | теги **карточек** (отдельная система от тегов задач) |
| `card_participants` | исполнители карточки |
| `card_comments`, `kanban_card_files` | комментарии и вложения карточек (файл или ссылка) |
| `project_storage`, `storage_files`, `storage_role_visibility` | хранилища проекта, их файлы/ссылки, видимость по ролям |
| `project_invitations` | приглашения в проект (по пользователю или e-mail) |
| `friends` | заявки и дружба (одна строка на пару) |
| `notifications`, `notification_settings` | уведомления и настройки категорий |
| `task_shift`, `task_shift_item` | история «Смещения сроков» (для отмены) |
| `extension*`, `user_extension`, `project_extension`, `extension_data`, `extension_audit`, `moderation_log`, `platform_roles` | система расширений |

### 3.2 Ключевые инварианты (защищены самой БД)

* В проекте **ровно одна главная RoadMap** (частичный уникальный индекс `uk_single_main_roadmap_per_project`: `parent_roadmap_id IS NULL`).
* Даты задачи: `start_date <= end_date` (CHECK).
* `task` ссылается на родителя (`parent_roadmap_id`) с `ON DELETE CASCADE` — удаление этапа удаляет всё вложенное.
* Теги и видимость привязаны к проекту составными ключами `(id, project_id)` — **нельзя** применить тег чужого проекта.
* Приглашение адресовано **ровно одному** получателю: пользователю или e-mail (CHECK `num_nonnulls = 1`), и только одно ожидающее приглашение на адресата.
* Дружба — одна строка на пару (`LEAST/GREATEST` в уникальном индексе), нельзя дружить с собой.

### 3.3 Дерево задач

```
Проект
└─ Главная RoadMap (parent_roadmap_id = NULL, одна)
   ├─ Этап RoadMap (type=ROADMAP)
   │  ├─ Вложенный этап …
   │  └─ ToDo-задача (type=TODO)  ← у неё есть канбан-доска
   └─ ToDo-задача
         └─ колонки (kanban_column) → карточки (kanban_card)
```

Родителем задачи может быть только `ROADMAP`. Циклы запрещены (`validateNoCyclicDependency`).

---

## 4. Безопасность и права (RBAC)

### 4.1 Аутентификация

* Регистрация/вход: `POST /api/auth/register|login`; пароль хранится как **bcrypt-хеш**; в ответ — **JWT** (`generateToken(id, email)`).
* Клиент хранит токен в `localStorage` (`vector_token`) и шлёт `Authorization: Bearer <token>`.
* `authMiddleware` проверяет токен и кладёт пользователя в `req.user`. Запросы `OPTIONS` (CORS preflight) пропускаются.

### 4.2 Права внутри проекта

Четыре права из таблицы `access_rights` складываются из ролей участника:

| Право | Смысл | Типичные действия |
|---|---|---|
| `READ` | просмотр | видеть задачи, доску, файлы |
| `WRITE` | участие | двигать карточки, комментировать, менять статус |
| `EXECUTE` | управление | создавать/править задачи, колонки, карточки, теги, хранилища, смещать сроки, дашборд |
| `ADMIN` | администрирование | настройки проекта, роли, участники, расширения; **даёт доступ ко всему** |

При создании проекта создаются 4 роли: **Администратор** (READ+WRITE+EXECUTE+ADMIN, назначается создателю), **Руководитель** (READ+WRITE+EXECUTE), **Участник** (READ+WRITE), **Наблюдатель** (READ — её получает принявший приглашение). Роли редактируются во вкладке «Роли» (матрица прав). Защита: нельзя оставить проект без администратора (`RoleRepository.assertAdminSurvivesWithout`).

### 4.3 Как проверяется запрос

`middleware/rbacMiddleware.js` — фабрики вида `checkXAccess('EXECUTE')`. Каждая:

1. по `id` из URL (`:taskId`, `:cardId`, `:columnId`, `:tagId`, `:commentId`, `:roleId`, `:storageId` …) **находит проект**, которому принадлежит объект;
2. читает права пользователя в этом проекте (`RoleRepository.getUserPermissionsInProject`);
3. пропускает, если есть нужное право или `ADMIN`; иначе — `403`;
4. для задач дополнительно учитывает **видимость по ролям**: скрытая от роли задача (и всё вложенное) для неё «не существует» (`404`).

Так расширения и обычный клиент ходят через одни и те же проверки.

### 4.4 Файлы

Загрузки лежат в `STORAGE_DIR` **вне веб-корня** и скачиваются только через API с проверкой прав. Картинки профиля проверяются по первым байтам (`utils/images.js`), а не по заголовку.

---

## 5. Сервер: файлы и классы

### 5.1 `server/index.js` и `config/`

* `index.js` — точка входа: подключает `cors`, `express.json`, статику `/public` и `/uploads`, Swagger на `/docs`, все роуты, обработчик «файл слишком большой».
* `config/db.js` — пул соединений `pg`; **приводит bigint к number**, чтобы `id` приходили числами.
* `config/swagger.js` — описание Swagger.
* `seed.js` — очистка данных и заполнение демо-проектами (справочники не трогает).

### 5.2 Роуты (`server/routes`) и префиксы

| Файл | Префикс | Назначение |
|---|---|---|
| `authRoutes` | `/api/auth` | регистрация, вход, профиль (имя, e-mail, пароль, аватар), удаление аккаунта |
| `projectRoutes` | `/api/projects` | проекты, участники, приглашения, аватар проекта, выход из проекта |
| `taskRoutes` | `/api/tasks` | дерево задач, создание RoadMap/ToDo, правка названий/дат/статусов, поиск, видимость по ролям |
| `kanbanRoutes` | `/api/kanban` | доска, колонки, карточки, перенос, исполнители, комментарии |
| `kanbanTagRoutes` | `/api/kanban-tags` | теги карточек: список, создание, правка (имя/цвет), удаление, применение |
| `taskTagRoutes` | `/api/task-tags` | теги задач RoadMap/ToDo |
| `roleRoutes` | `/api/roles` | роли проекта, права ролей, назначение роли участнику |
| `invitationRoutes` | `/api/invitations` | приглашения: список, принять, отклонить |
| `notificationRoutes` | `/api/notifications` | лента, счётчик, настройки, отметки «прочитано» |
| `storageRoutes` | `/api/storage` | хранилища, файлы/ссылки, скачивание, видимость |
| `myTasksRoutes` | `/api/my-tasks` | вкладка «Задачи» |
| `taskShiftRoutes` | `/api/task-shifts` | смещение сроков: предпросмотр, применение, история, отмена |
| `dashboardRoutes` | `/api/dashboard` | данные дашборда проекта |
| `friendRoutes` | `/api/friends` | друзья и заявки |
| `extensionRoutes` | `/api` | `/extensions`, `/moderation`, `/platform` |
| `extensionServeRoutes` | `/ext`, `/extp` | раздача файлов расширений |

### 5.3 Репозитории (`server/db`) — что делает каждый класс

| Класс | Ответственность и ключевые методы |
|---|---|
| `UserRepository` | пользователи: `findByEmail/findByIdentifier` (поиск без учёта регистра), `createUser`, `updateUsername/Email/Password/Avatar`, `deleteUser` |
| `ProjectRepository` | проекты и участие: `createProject` (в транзакции создаёт проект, 4 роли, участника-админа и **главную RoadMap**), `getUserProjects`, `getParticipants`, `addParticipant…`, `leave`, `deleteProject`, `updateProjectDetails` |
| `RoleRepository` | роли и права: `createProjectRole`, `addRightToRole/removeRightFromRole`, `assignRoleToParticipant`, `getUserPermissionsInProject` (сумма прав всех ролей участника), `assertAdminSurvivesWithout` |
| `TaskRepository` | единая таблица задач: `createBaseTask` (общая валидация: тип родителя, даты внутри этапа, циклы), `getProjectTree` (дерево с тегами и ролями видимости), `updateTaskDates/Title/Status`, `searchTasks`, `deleteTask`, `notifyStatusChange` |
| `RoadmapRepository` | `createRoadmapStage` — этап RoadMap (запись в `task` + `roadmap_task`) |
| `TodoRepository` | `createTodoTask` — ToDo + 3 стартовые колонки в одной транзакции |
| `KanbanRepository` | доска и карточки: `getBoardByTodoId`, колонки (`create/update/deleteColumn`), карточки (`createCard`, `moveCard` — **перенумерует позиции** в обеих колонках, `updateCardDetails`, `updateCardStatus`, `deleteCard`), исполнители, `applyTag/removeTag` |
| `KanbanTagRepository` | теги карточек: `getProjectTags`, `createTag`, `updateTagDetails`, `deleteTag`, `applyTagToCard/removeTagFromCard` |
| `TaskTagRepository` | теги задач: список, CRUD, `setTaskTags` (заменить набор), применить/снять |
| `TaskVisibilityRepository` | видимость задач по ролям: `getRoles/setRoles`, `canSee`, `userRoleIds` |
| `CommentRepository` | комментарии карточек: список, создание, правка (только автор), удаление |
| `FileRepository` | вложения карточек: файл (`upload:<ключ>\|<имя>`) или ссылка (`http(s)://…`) |
| `StorageRepository` | хранилища проекта: папки, файлы и ссылки, видимость по ролям (`canSee`, `setRoles`) |
| `InvitationRepository` | приглашения: создать, список, отменить, `respond` (принятие даёт роль «Наблюдатель») |
| `FriendRepository` | заявки/дружба: `sendRequest`, `accept`, `remove`, `listForUser` |
| `NotificationRepository` | уведомления: `create/createMany`, лента с категориями, непрочитанные, настройки |
| `MyTasksRepository` | `forUser` — по проектам три группы: `overdue` (срок вышел), `soon` (≤ 3 дней), `current`; «своими» считаются карточки, где вы исполнитель (`mine`), и задачи, видимость которых настроена на вашу роль (`targeted`) |
| `TaskShiftRepository` | «Смещение сроков»: `plan` (предпросмотр), `apply` (сдвиг + запись в историю), `history`, `undo` |
| `DashboardRepository` | `forProject` — показатели, просрочки, ближайшие сроки, недели, нагрузка людей, отстающие ToDo, сводка по смещениям |
| `ExtensionRepository`, `ExtensionGuardRepository`, `PlatformRepository` | система расширений — см. EXTENSIONS_GUIDE.md |

### 5.4 Middleware и утилиты

| Файл | Назначение |
|---|---|
| `middleware/authMiddleware.js` | `authMiddleware` (проверка JWT), `generateToken` |
| `middleware/rbacMiddleware.js` | `checkProjectAccess`, `checkTaskAccess`, `checkCardAccess`, `checkColumnAccess`, `checkKanbanTagAccess`, `checkTaskTagAccess`, `checkRoleAccess`, `checkShiftAccess`, `checkCommentAccess`, `checkStorageAccess`… |
| `middleware/platformMiddleware.js` | `requirePlatformRole('MODERATOR'|'ADMIN')` для расширений |
| `utils/httpError.js` | `sendError` — перевод ошибок в HTTP-ответ |
| `utils/fileStore.js` | сохранение/чтение/удаление загруженных файлов, лимит 25 МБ |
| `utils/images.js` | проверка картинок по сигнатуре |
| `utils/extensionPackage.js`, `utils/extensionStore.js` | проверка и хранение пакетов расширений |

---

## 6. Как работают главные системы

### 6.1 RoadMap и сроки

* Страница `ProjectPage` загружает **дерево** (`GET /api/tasks/projects/:id/tree`) и показывает его на **временной шкале** (`Timeline.tsx`): дорожки задач, масштаб, перетаскивание полосы (сдвиг) и её краёв (изменение срока) — доступно с правом EXECUTE.
* Даты хранятся как ISO-строки; расчёты на клиенте идут **в UTC** (`utils/dates.ts`), чтобы день не «съезжал» из-за часового пояса.
* Даты дочерних задач ограничены границами этапа-родителя (проверяется на сервере и подсказывается в форме создания).
* **Статусы** показываются цветом (`utils/status.ts`); справа от шкалы — панель задачи (`TaskInspector.tsx`): название, даты, статус, теги, видимость по ролям, ссылки на ToDo-доску и расширения.
* **Смещение сроков** (`ShiftModal.tsx` + `TaskShiftRepository`): выбираете этап, дату «с» и число дней; сервер строит **предпросмотр**, затем применяет сдвиг к задачам этого уровня (и вложенным) и записывает историю в `task_shift`/`task_shift_item`; любое смещение можно **отменить**.
* **Фильтры** (`RoadmapFilters.tsx`) — статус, теги, период; применяются на клиенте к уже загруженному дереву.

### 6.2 ToDo и Канбан

* `TodoPage` — доска ToDo-задачи: `KanbanBoard.tsx` рисует колонки и карточки; перенос — drag-and-drop (право WRITE) либо выбор колонки в карточке.
* Создание ToDo-задачи автоматически создаёт 3 колонки (`TodoRepository.createTodoTask`).
* **Карточка** открывается **боковой панелью** справа (`CardModal.tsx`): название и описание (сохраняются кнопкой «Сохранить», пока есть несохранённые правки), статус «выполнена», колонка, срок, **теги**, **исполнители**, вкладки «Комментарии» и «Вложения». Панель привязана к `key={card.id}` — при выборе другой карточки состояние формы пересоздаётся.
* **Теги карточек** редактируются прямо из выпадающего списка тегов: карандаш рядом с тегом → смена названия и цвета, корзина → удаление тега из проекта (он пропадает со всех карточек). Создание нового тега — внизу списка. Все эти действия требуют право EXECUTE.
* Колонки можно создавать, переименовывать, красить (поле `color`, в ответе `column_color`) и удалять.
* Для расширений: перед завершением/переносом карточки ядро вызывает `ExtensionGuardRepository.checkCard`.

### 6.3 Команда, приглашения, друзья, уведомления

* Приглашение создаётся в «Настройки → Участники» (по e-mail или по имени). Адресат видит его в «Уведомлениях» и принимает/отклоняет — после принятия он становится участником с ролью «Наблюдатель».
* Друзья — отдельная вкладка: заявка по e-mail/имени, принять/отклонить, список.
* **Уведомления** создаются репозиториями при событиях: приглашение, комментарий к карточке, смена статуса задачи, заявка в друзья, события расширений. Тип определяет текст и ссылку (`NotificationsPage.tsx`); категории можно скрыть в настройках (они уйдут во вкладку «Скрытые»).

### 6.4 Хранилища

Хранилище — папка проекта с файлами и ссылками (`StoragesSection.tsx`, полоса внизу RoadMap). Файл до 25 МБ загружается на сервер и скачивается только через API с проверкой прав; видимость хранилища настраивается по ролям.

### 6.5 «Задачи» и дашборд

* **Задачи** (`TasksPage.tsx`) — по каждому проекту три группы по срочности: «Просрочено», «Скоро срок» (≤ 3 дней), «В работе». Плитки сверху — фильтры по группам; переключатель «Все доступные / Мои и для моей роли». Строка: название, путь, пометка «Вы»/«Ваша роль», статус, срок.
* **Дашборд** (`DashboardPage.tsx`, право EXECUTE): показатели (задач, % выполнения, просрочено, карточки, требуют внимания), статусы с процентами, график сроков по неделям, нагрузка участников (закрыто/в работе/просрочено), список просроченных и ближайших, отстающие ToDo, сводка по смещениям. Все данные — один запрос `GET /api/dashboard/projects/:id` (`DashboardRepository.forProject`).

### 6.6 Темы и дизайн

* Четыре темы (`ThemeContext.tsx`): **системная светлая** (кофейная), **системная тёмная**, **светлая**, **тёмная**; выбор хранится в `localStorage` (`vector_theme`). Тема — атрибут `data-theme` на `<html>`.
* Все цвета, радиусы, шрифты — **дизайн-токены**: правим `resources/design/tokens.json`, затем `node resources/design/build-tokens.mjs` → `tokens.css`. В `styles.css` используются только переменные (`var(--color-…)`, `--radius-…`).
* Иконки — SVG в `resources/icons/`, имя файла = имя иконки (`<Icon name="trash" />`); новая иконка — SVG 24×24, `stroke="currentColor"`.
* Адаптивность: окна на телефоне превращаются в нижние шторки или полноэкранные; панель карточки — на весь экран.

---

## 7. Клиент: файлы и компоненты

### 7.1 Корень `client/src`

| Файл | Назначение |
|---|---|
| `main.tsx` | вход: подключает токены и стили, провайдеры, роутер |
| `App.tsx` | маршруты; `RequireAuth` (пускает только вошедших), `GuestOnly` (вошедшего уводит с `/login`) |
| `api.ts` | **единый справочник REST API**: функция `request` (подставляет токен, разбирает ошибки) и группы методов `api.auth`, `api.projects`, `api.tasks`, `api.kanban`, `api.kanbanTags`, `api.roles`, `api.storage`, … Любое новое обращение к серверу добавляем сюда |
| `types.ts` | TypeScript-типы ответов сервера (поля в `snake_case`, как в БД) |
| `styles.css` | все стили приложения |
| `auth/AuthContext.tsx` | текущий пользователь: `login`, `register`, `logout`, `refreshUser`, проверка токена при запуске |
| `theme/ThemeContext.tsx` | тема приложения |
| `utils/status.ts` | `TASK_STATUSES` (название+цвет), `statusById`, `textOn(цвет)` — читаемый цвет текста на заливке |
| `utils/dates.ts` | расчёты дат в UTC, подписи «через 2 дн.» |
| `utils/format.ts`, `image.ts`, `extensions.ts` | размер файла; обрезка аватарки до квадрата 256×256; подписи прав расширений |

### 7.2 Маршруты

| URL | Страница |
|---|---|
| `/login`, `/register` | `AuthPage` |
| `/` (Проекты) | `ProjectsPage` — список проектов, создание |
| `/projects/:id`, `/projects/:id/roadmap/:rid` | `ProjectPage` — RoadMap |
| `/projects/:id/todo/:todoId` | `TodoPage` — Канбан |
| `/projects/:id/dashboard` | `DashboardPage` |
| `/projects/:id/ext/:extId/:viewId` | `ExtensionViewPage` — страница расширения |
| `/tasks` | `TasksPage` |
| `/friends`, `/notifications`, `/profile` | `FriendsPage`, `NotificationsPage`, `ProfilePage` |
| `/extensions`, `/extensions/:id` | `ExtensionsPage` (каталог, библиотека, разработки, модерация), `ExtensionDetailPage` |

### 7.3 Компоненты

**Каркас:** `Layout` (левое меню + мобильная шапка), `Sidebar`, `UserMenu`, `Logo`, `ThemeSwitcher`, `ProjectShell` (оболочка проекта: узкая панель действий слева, «хлебные крошки», содержимое).

**Базовые элементы:** `Modal` (размеры sm…full, закрытие по клику вне окна и Esc — отключается для настроек), `Dropdown` (выпадающая панель; на телефоне — нижняя шторка), `Icon`, `Avatar`, `FileDrop`, `FileItem`.

**RoadMap:** `Timeline` (шкала), `TaskInspector` (панель задачи), `RoadmapFilters`, `ShiftModal`, `CreateTaskModal`, `StoragesSection`.

**Канбан:** `KanbanBoard` (доска), `CardModal` (боковая панель карточки).

**Проект и команда:** `ProjectSettingsModal` (большое окно настроек) с вкладками из `components/settings/`: `GeneralTab`, `MembersTab`, `RolesTab` (матрица прав), `TagsTab` (теги задач), `ExtensionsTab`; `CreateProjectModal`, `AddMemberModal`.

**Расширения** (`components/extensions/`): `ExtensionFrame` (песочница + мост), `TaskExtensionPanels`, `ProjectExtensionsMenu`, `CatalogTab`, `LibraryTab`, `MineTab`, `ModerationTab`, `StaffTab`, `UploadModal`, `PermissionPicker`, `ExtCover`.

---

## 8. Типовые сценарии — что вызывается

**«Участник переносит карточку»**: `KanbanBoard` drag → `api.kanban.moveCard` → `PATCH /api/kanban/cards/:id/move` (путь относительно `/api/kanban`) → `checkCardAccess('WRITE')` → стражи расширений (`checkCard`) → `KanbanRepository.moveCard` (транзакция, перенумерация позиций) → клиент перезагружает доску.

**«Руководитель меняет цвет тега»**: `CardModal` → карандаш → `api.kanbanTags.update(id, {name, colorCode})` → `PATCH /api/kanban-tags/:id/details` → `checkKanbanTagAccess('EXECUTE')` → `KanbanTagRepository.updateTagDetails` → `onChanged()` (`TodoPage.load`) перечитывает доску и теги.

**«Новый участник»**: `AddMemberModal` → `POST /api/projects/:id/invitations` → запись в `project_invitations` + уведомление → адресат принимает в «Уведомлениях» → `InvitationRepository.respond` → строка в `project_participants` + роль «Наблюдатель».

---

## 9. Как добавить новую возможность (чек-лист)

1. **БД**: новая миграция `server/db/migrations/0NN_*.sql` (идемпотентная, `BEGIN … COMMIT`, `IF NOT EXISTS`); при необходимости — справочник.
2. **Репозиторий**: метод в соответствующем `*Repository.js` (SQL, транзакция при нескольких шагах, понятные `Error('4xx: …')`).
3. **Права**: если объект принадлежит проекту — используйте существующий `check…Access` или добавьте новый в `rbacMiddleware.js`.
4. **Роут**: `router.<метод>(путь, authMiddleware, check…Access('…'), handler)` + Swagger-комментарий; подключить файл в `index.js`, если он новый.
5. **Клиент**: метод в `api.ts`, тип в `types.ts`, компонент/страница, маршрут в `App.tsx`.
6. **Стили**: только токены (`var(--color-…)`), радиусы `var(--radius-sm|md|lg)`; адаптив до 820 px.
7. **Тест**: `server/tests` (`npm test` в `server`) для чистой логики; интерфейс — вручную на десктопе и телефоне, в светлой и тёмной теме.

---

## 10. Известные ограничения

* Миграции применяются вручную (нет автоматического раннера).
* Токен хранится в `localStorage` (стандартный компромисс для SPA; защищает от этого CSP и санитизация вывода).
* Расширения не исполняют серверный код — возможности ограничены мостом и «стражами».
* Реального времени (WebSocket) нет: изменения других пользователей видны после обновления данных.
