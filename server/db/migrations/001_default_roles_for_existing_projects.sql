-- Выдаёт стандартные роли проектам, созданным ДО появления проверки прав.
-- Администратор назначается самому первому участнику проекта (создателю).
-- Проекты, у которых роли уже есть (например, из seed.js), не затрагиваются.
-- Запуск: открыть в pgAdmin (Query Tool) и выполнить один раз.

DO $$
DECLARE
  p RECORD;
  r RECORD;
  new_role_id INT;
  first_participant BIGINT;
BEGIN
  FOR p IN
    SELECT id FROM project pr
    WHERE NOT EXISTS (SELECT 1 FROM project_roles WHERE project_id = pr.id)
  LOOP
    FOR r IN
      SELECT * FROM (VALUES
        ('Администратор', ARRAY['READ','WRITE','EXECUTE','ADMIN']),
        ('Руководитель',  ARRAY['READ','WRITE','EXECUTE']),
        ('Участник',      ARRAY['READ','WRITE']),
        ('Наблюдатель',   ARRAY['READ'])
      ) AS t(name, rights)
    LOOP
      INSERT INTO project_roles (project_id, name) VALUES (p.id, r.name)
      RETURNING id INTO new_role_id;

      INSERT INTO role_access_rights (project_role_id, access_right_id)
      SELECT new_role_id, id FROM access_rights WHERE name = ANY(r.rights);

      IF r.name = 'Администратор' THEN
        SELECT MIN(id) INTO first_participant FROM project_participants WHERE project_id = p.id;
        IF first_participant IS NOT NULL THEN
          INSERT INTO assigned_roles (project_participant_id, project_role_id)
          VALUES (first_participant, new_role_id);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Проверка: должны быть имена READ, WRITE, EXECUTE, ADMIN
-- SELECT * FROM access_rights;
