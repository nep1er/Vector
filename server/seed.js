import bcrypt from 'bcrypt';
import { pool } from './config/db.js';

async function seedDatabase() {
  const client = await pool.connect();
  try {
    console.log('🌱 Начинаем заново заполнение базы данных по точной DDL-схеме...');
    await client.query('BEGIN');

    // 1. Очистка таблиц данных (справочники access_rights, task_type, card_status, task_status,
    //    friend_status, invitation_status, notification_type не трогаем!)
    await client.query('TRUNCATE users, project CASCADE;');

    // 2. Создание пользователей
    const passHash = await bcrypt.hash('password123', 10);

    const adminUser = await client.query(
      `INSERT INTO users (username, email, password_hash) 
       VALUES ('admin_alex', 'admin@vector.ru', $1) RETURNING id`,
      [passHash]
    );
    const pmUser = await client.query(
      `INSERT INTO users (username, email, password_hash) 
       VALUES ('pm_maria', 'pm@vector.ru', $1) RETURNING id`,
      [passHash]
    );
    const devUser = await client.query(
      `INSERT INTO users (username, email, password_hash) 
       VALUES ('dev_ivan', 'dev@vector.ru', $1) RETURNING id`,
      [passHash]
    );

    const adminId = adminUser.rows[0].id;
    const pmId = pmUser.rows[0].id;
    const devId = devUser.rows[0].id;

    console.log('✅ Пользователи созданы (Пароль у всех: password123)');

    // 3. Создание проекта
    const projectRes = await client.query(
      `INSERT INTO project (title, description) 
       VALUES ('Разработка ИС Управления Проектами', 'Главный проект компании 2026') 
       RETURNING id`
    );
    const projectId = projectRes.rows[0].id;

    // 4. Добавление участников в проект (project_participants)
    const partAdmin = await client.query(
      `INSERT INTO project_participants (project_id, user_id) VALUES ($1, $2) RETURNING id`,
      [projectId, adminId]
    );
    const partPM = await client.query(
      `INSERT INTO project_participants (project_id, user_id) VALUES ($1, $2) RETURNING id`,
      [projectId, pmId]
    );
    const partDev = await client.query(
      `INSERT INTO project_participants (project_id, user_id) VALUES ($1, $2) RETURNING id`,
      [projectId, devId]
    );

    // Внутри seedDatabase() заменим блок 5 на:

// 5. Создание ролей проекта
const ownerRole = await client.query(
  `INSERT INTO project_roles (project_id, name) VALUES ($1, 'Owner') RETURNING id`,
  [projectId]
);
const devRole = await client.query(
  `INSERT INTO project_roles (project_id, name) VALUES ($1, 'Developer') RETURNING id`,
  [projectId]
);

// Назначаем права ролям (1=READ, 2=WRITE, 4=ADMIN)
await client.query(
  `INSERT INTO role_access_rights (project_role_id, access_right_id) VALUES ($1, 4)`,
  [ownerRole.rows[0].id]
);
await client.query(
  `INSERT INTO role_access_rights (project_role_id, access_right_id) VALUES ($1, 2)`,
  [devRole.rows[0].id]
);

// Назначаем роли участникам проекта
await client.query(
  `INSERT INTO assigned_roles (project_participant_id, project_role_id) VALUES ($1, $2)`,
  [partAdmin.rows[0].id, ownerRole.rows[0].id]
);
await client.query(
  `INSERT INTO assigned_roles (project_participant_id, project_role_id) VALUES ($1, $2)`,
  [partDev.rows[0].id, devRole.rows[0].id]
);

// Роль «Наблюдатель» (READ) — её получает каждый, кто принял приглашение в проект
const observerRole = await client.query(
  `INSERT INTO project_roles (project_id, name) VALUES ($1, 'Наблюдатель') RETURNING id`,
  [projectId]
);
await client.query(
  `INSERT INTO role_access_rights (project_role_id, access_right_id)
   SELECT $1, id FROM access_rights WHERE name = 'READ'`,
  [observerRole.rows[0].id]
);
await client.query(
  `INSERT INTO assigned_roles (project_participant_id, project_role_id) VALUES ($1, $2)`,
  [partPM.rows[0].id, observerRole.rows[0].id]
);
    console.log('✅ Проект и ролевая модель RBAC сформированы');

    // 6. Создание Главной Корневой RoadMap (parent_roadmap_id IS NULL)
    // Атрибуты start_date и end_date хранятся в СУПЕРТИПЕ task
    const rootTask = await client.query(
      `INSERT INTO task (project_id, type, title, description, start_date, end_date) 
       VALUES ($1, 'ROADMAP', 'План разработки 2026', 'Стратегический план развития', '2026-01-01', '2026-12-31') 
       RETURNING id`,
      [projectId]
    );
    const rootTaskId = rootTask.rows[0].id;

    // Подтип roadmap_task
    await client.query(
      `INSERT INTO roadmap_task (task_id, type, title) 
       VALUES ($1, 'ROADMAP', 'План разработки 2026')`,
      [rootTaskId]
    );

    // 7. Создание дочерней ToDo задачи (Спринт 1)
    const todoTask = await client.query(
      `INSERT INTO task (project_id, type, title, parent_roadmap_id) 
       VALUES ($1, 'TODO', 'Спринт 1: Backend и БД', $2) RETURNING id`,
      [projectId, rootTaskId]
    );
    const todoTaskId = todoTask.rows[0].id;

    // Подтип todo_task
    await client.query(
      `INSERT INTO todo_task (task_id, type, title) VALUES ($1, 'TODO', 'Спринт 1: Backend и БД')`,
      [todoTaskId]
    );

    // 8. Колонки Канбана для ToDo (ссылаются на todo_task.task_id)
    const col1 = await client.query(
      `INSERT INTO kanban_column (todo_task_id, title, position) VALUES ($1, 'К выполнению', 1) RETURNING id`,
      [todoTaskId]
    );
    const col2 = await client.query(
      `INSERT INTO kanban_column (todo_task_id, title, position) VALUES ($1, 'В работе', 2) RETURNING id`,
      [todoTaskId]
    );

    // 9. Добавление карточки в Канбан (card_status_id: 0 = Не выполнена)
    const cardRes = await client.query(
      `INSERT INTO kanban_card (kanban_column_id, card_status_id, title, description, position) 
       VALUES ($1, 0, 'Реализовать REST API', 'Написать роуты и репозитории PostgreSQL', 1)
       RETURNING id`,
      [col2.rows[0].id]
    );
    const cardId = cardRes.rows[0].id;

    // 10. Тег КАНБАНА (kanban_tag) и привязка к карточке
    const tagRes = await client.query(
      `INSERT INTO kanban_tag (project_id, name, color_code) 
       VALUES ($1, 'Backend', '#4A90D9') RETURNING id`,
      [projectId]
    );
    await client.query(
      `INSERT INTO kanban_tags_applies (kanban_tag_id, kanban_card_id) VALUES ($1, $2)`,
      [tagRes.rows[0].id, cardId]
    );

    // 11. Теги ЗАДАЧ (task_tag) — независимая система для этапов RoadMap/ToDo
    const progTag = await client.query(
      `INSERT INTO task_tag (project_id, name, color_code)
       VALUES ($1, 'Программирование', '#4A90D9') RETURNING id`,
      [projectId]
    );
    await client.query(
      `INSERT INTO task_tag (project_id, name, color_code) VALUES ($1, 'Арт', '#E85D75')`,
      [projectId]
    );
    await client.query(
      `INSERT INTO task_tag_applies (task_id, task_tag_id, project_id) VALUES ($1, $2, $3)`,
      [todoTaskId, progTag.rows[0].id, projectId]
    );

    // 12. Статус задачи (справочник task_status): 2 = «В процессе»
    await client.query(`UPDATE task SET status_id = 2 WHERE id = $1`, [todoTaskId]);

    await client.query('COMMIT');
    console.log('🚀 БАЗА ДАННЫХ УСПЕШНО ЗАСЕЯНА НАЧАЛЬНЫМИ ДАННЫМИ!');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('❌ Ошибка при заполнении БД:', e);
  } finally {
    client.release();
    process.exit();
  }
}

seedDatabase();