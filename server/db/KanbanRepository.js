import { pool } from '../config/db.js';
import { FileRepository } from './FileRepository.js';
import { removeFile } from '../utils/fileStore.js';

const CARD_COLUMNS = `c.id, c.kanban_column_id, c.title, c.description, c.card_status_id AS status_id,
  c.work_date, c.position, c.created_at`;

function cleanTitle(value, label, max) {
  const t = String(value ?? '').trim();
  if (!t) throw new Error(`400: Введите ${label}`);
  if (t.length > max) throw new Error(`400: ${label[0].toUpperCase()}${label.slice(1)} — не длиннее ${max} символов`);
  return t;
}

/** Выполняет fn(client) в транзакции */
async function inTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Записывает порядок: ids[i] получает position = i + 1 */
async function writeOrder(client, table, ids) {
  if (ids.length === 0) return;
  await client.query(
    `UPDATE ${table} SET position = u.pos
     FROM unnest($1::bigint[], $2::int[]) AS u(id, pos)
     WHERE ${table}.id = u.id;`,
    [ids, ids.map((_, i) => i + 1)]
  );
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** Канбан-доска ToDo-задачи: колонки (kanban_column) и карточки (kanban_card) */
export class KanbanRepository {
  // ===== Доска ============================================================

  static async getBoardByTodoId(todoTaskId) {
    const cols = await pool.query(
      `SELECT id AS column_id, title AS column_title, position, color AS column_color
       FROM kanban_column WHERE todo_task_id = $1 ORDER BY position, id;`,
      [todoTaskId]
    );
    const cards = await pool.query(
      `SELECT ${CARD_COLUMNS},
         (SELECT COALESCE(json_agg(json_build_object('id', g.id, 'name', g.name, 'color_code', g.color_code) ORDER BY g.name), '[]'::json)
            FROM kanban_tags_applies a JOIN kanban_tag g ON g.id = a.kanban_tag_id
            WHERE a.kanban_card_id = c.id) AS tags,
         (SELECT COALESCE(json_agg(json_build_object('participant_id', pp.id, 'user_id', u.id,
                  'username', u.username, 'avatar_url', u.avatar_url) ORDER BY u.username), '[]'::json)
            FROM card_participants cp
            JOIN project_participants pp ON pp.id = cp.project_participant_id
            JOIN users u ON u.id = pp.user_id
            WHERE cp.kanban_card_id = c.id) AS participants,
         (SELECT COUNT(*)::int FROM card_comments x WHERE x.kanban_card_id = c.id) AS comments_count,
         (SELECT COUNT(*)::int FROM kanban_card_files f WHERE f.kanban_card_id = c.id) AS files_count
       FROM kanban_card c
       JOIN kanban_column kc ON kc.id = c.kanban_column_id
       WHERE kc.todo_task_id = $1
       ORDER BY c.position, c.id;`,
      [todoTaskId]
    );
    const byColumn = new Map(cols.rows.map((c) => [c.column_id, { ...c, cards: [] }]));
    for (const card of cards.rows) byColumn.get(card.kanban_column_id)?.cards.push(card);
    return [...byColumn.values()];
  }

  static async findCard(cardId) {
    const res = await pool.query(`SELECT ${CARD_COLUMNS} FROM kanban_card c WHERE c.id = $1;`, [cardId]);
    return res.rows[0];
  }

  static async findColumn(columnId) {
    const res = await pool.query('SELECT * FROM kanban_column WHERE id = $1;', [columnId]);
    return res.rows[0];
  }

  /** Проект и ToDo-задача по колонке / ToDo-задаче (для проверки, что id относятся к одному проекту) */
  static async todoProject(todoTaskId) {
    const res = await pool.query(`SELECT project_id FROM task WHERE id = $1 AND type = 'TODO';`, [todoTaskId]);
    return res.rows[0]?.project_id;
  }

  // ===== Колонки ==========================================================

  /** Новая колонка; без position — в конец, с position (1…n) — вставка на это место */
  static async createColumn(todoTaskId, title, position) {
    const clean = cleanTitle(title, 'название колонки', 100);
    if (!(await this.todoProject(todoTaskId))) throw new Error('404: ToDo-задача не найдена');
    return inTransaction(async (client) => {
      const ids = (
        await client.query('SELECT id FROM kanban_column WHERE todo_task_id = $1 ORDER BY position, id;', [todoTaskId])
      ).rows.map((r) => r.id);
      const res = await client.query(
        'INSERT INTO kanban_column (todo_task_id, title, position) VALUES ($1, $2, $3) RETURNING *;',
        [todoTaskId, clean, ids.length + 1]
      );
      const col = res.rows[0];
      const at = position == null ? ids.length : clamp(Number(position) - 1, 0, ids.length);
      ids.splice(at, 0, col.id);
      await writeOrder(client, 'kanban_column', ids);
      return { ...col, position: at + 1 };
    });
  }

  /** Переименование и/или перемещение колонки (position — новое место, начиная с 1) */
  static async updateColumn(columnId, { title, position, color }) {
    const col = await this.findColumn(columnId);
    if (!col) throw new Error('404: Колонка не найдена');
    return inTransaction(async (client) => {
      if (title !== undefined) {
        await client.query('UPDATE kanban_column SET title = $1 WHERE id = $2;', [
          cleanTitle(title, 'название колонки', 100),
          columnId,
        ]);
      }
      if (color !== undefined) {
        // null — вернуть цвет по умолчанию
        if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(String(color))) throw new Error('400: Цвет — в формате #RRGGBB');
        await client.query('UPDATE kanban_column SET color = $1 WHERE id = $2;', [color, columnId]);
      }
      if (position !== undefined && position !== null) {
        const ids = (
          await client.query('SELECT id FROM kanban_column WHERE todo_task_id = $1 ORDER BY position, id;', [
            col.todo_task_id,
          ])
        ).rows.map((r) => r.id);
        const rest = ids.filter((id) => id !== Number(columnId));
        rest.splice(clamp(Number(position) - 1, 0, rest.length), 0, Number(columnId));
        await writeOrder(client, 'kanban_column', rest);
      }
      return (await client.query('SELECT * FROM kanban_column WHERE id = $1;', [columnId])).rows[0];
    });
  }

  /**
   * Удаляет колонку. Если в ней есть карточки, нужно либо указать moveToColumnId
   * (карточки переедут в конец той колонки), либо подтвердить удаление вместе с карточками.
   */
  static async deleteColumn(columnId, { moveToColumnId = null, withCards = false } = {}) {
    const col = await this.findColumn(columnId);
    if (!col) throw new Error('404: Колонка не найдена');
    const keys =
      moveToColumnId == null
        ? await FileRepository.uploadKeysWhere(
            'f.kanban_card_id IN (SELECT id FROM kanban_card WHERE kanban_column_id = $1)',
            [columnId]
          )
        : [];
    const result = await inTransaction(async (client) => {
      const cnt = (await client.query('SELECT COUNT(*)::int AS n FROM kanban_card WHERE kanban_column_id = $1;', [columnId]))
        .rows[0].n;
      if (cnt > 0 && moveToColumnId == null && !withCards) {
        throw new Error('409: В колонке есть карточки — укажите moveTo (куда перенести) или withCards=true');
      }
      if (cnt > 0 && moveToColumnId != null) {
        const target = (
          await client.query('SELECT id FROM kanban_column WHERE id = $1 AND todo_task_id = $2 AND id <> $3;', [
            moveToColumnId,
            col.todo_task_id,
            columnId,
          ])
        ).rows[0];
        if (!target) throw new Error('400: Колонка для переноса должна быть другой колонкой этой же доски');
        await client.query(
          'UPDATE kanban_card SET kanban_column_id = $1, position = position + (SELECT COUNT(*) FROM kanban_card WHERE kanban_column_id = $1) WHERE kanban_column_id = $2;',
          [moveToColumnId, columnId]
        );
        const ids = (
          await client.query('SELECT id FROM kanban_card WHERE kanban_column_id = $1 ORDER BY position, id;', [moveToColumnId])
        ).rows.map((r) => r.id);
        await writeOrder(client, 'kanban_card', ids);
      }
      await client.query('DELETE FROM kanban_column WHERE id = $1;', [columnId]);
      const rest = (
        await client.query('SELECT id FROM kanban_column WHERE todo_task_id = $1 ORDER BY position, id;', [col.todo_task_id])
      ).rows.map((r) => r.id);
      await writeOrder(client, 'kanban_column', rest);
      return { id: Number(columnId), movedCards: moveToColumnId != null ? cnt : 0, deletedCards: moveToColumnId == null ? cnt : 0 };
    });
    for (const k of keys) await removeFile(k);
    return result;
  }

  // ===== Карточки =========================================================

  static async createCard(columnId, { title, description = null, workDate = null, tagIds = [], participantIds = [] } = {}) {
    const clean = cleanTitle(title, 'название карточки', 200);
    const col = await this.findColumn(columnId);
    if (!col) throw new Error('404: Колонка не найдена');
    return inTransaction(async (client) => {
      const n = (await client.query('SELECT COUNT(*)::int AS n FROM kanban_card WHERE kanban_column_id = $1;', [columnId]))
        .rows[0].n;
      const res = await client.query(
        `INSERT INTO kanban_card (kanban_column_id, title, description, work_date, position)
         VALUES ($1, $2, $3, $4, $5) RETURNING id;`,
        [columnId, clean, description?.trim() || null, workDate || null, n + 1]
      );
      const cardId = res.rows[0].id;
      for (const tagId of tagIds) await this.#applyTag(client, cardId, tagId, col.todo_task_id);
      for (const pid of participantIds) await this.#addParticipant(client, cardId, pid, col.todo_task_id);
      return (await client.query(`SELECT ${CARD_COLUMNS} FROM kanban_card c WHERE c.id = $1;`, [cardId])).rows[0];
    });
  }

  /** Перемещение в колонку targetColumnId на место index (с 0). Колонки должны быть одной доски. */
  static async moveCard(cardId, targetColumnId, index, newStatusId) {
    const card = await this.findCard(cardId);
    if (!card) throw new Error('404: Карточка не найдена');
    return inTransaction(async (client) => {
      const src = (await client.query('SELECT todo_task_id FROM kanban_column WHERE id = $1;', [card.kanban_column_id])).rows[0];
      const dst = (await client.query('SELECT todo_task_id FROM kanban_column WHERE id = $1;', [targetColumnId])).rows[0];
      if (!dst) throw new Error('404: Колонка назначения не найдена');
      if (dst.todo_task_id !== src.todo_task_id) throw new Error('400: Нельзя переместить карточку на другую доску');

      const idsOf = async (colId) =>
        (await client.query('SELECT id FROM kanban_card WHERE kanban_column_id = $1 ORDER BY position, id;', [colId])).rows
          .map((r) => r.id)
          .filter((id) => id !== Number(cardId));
      const target = await idsOf(targetColumnId);
      const at = index == null ? target.length : clamp(Number(index), 0, target.length);
      target.splice(at, 0, Number(cardId));

      await client.query('UPDATE kanban_card SET kanban_column_id = $1 WHERE id = $2;', [targetColumnId, cardId]);
      if (newStatusId !== undefined && newStatusId !== null) {
        await client.query('UPDATE kanban_card SET card_status_id = $1 WHERE id = $2;', [newStatusId, cardId]);
      }
      await writeOrder(client, 'kanban_card', target);
      if (Number(targetColumnId) !== card.kanban_column_id) {
        await writeOrder(client, 'kanban_card', await idsOf(card.kanban_column_id));
      }
      return (await client.query(`SELECT ${CARD_COLUMNS} FROM kanban_card c WHERE c.id = $1;`, [cardId])).rows[0];
    });
  }

  /** Меняет только переданные поля; description и workDate можно очистить, передав null / '' */
  static async updateCardDetails(cardId, body = {}) {
    const sets = [];
    const params = [];
    const set = (col, value) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };
    if (body.title !== undefined) set('title', cleanTitle(body.title, 'название карточки', 200));
    if (body.description !== undefined) set('description', String(body.description ?? '').trim() || null);
    if (body.workDate !== undefined) set('work_date', body.workDate || null);
    if (sets.length === 0) throw new Error('400: Нет полей для изменения');
    params.push(cardId);
    const res = await pool.query(`UPDATE kanban_card SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id;`, params);
    if (res.rows.length === 0) throw new Error('404: Карточка не найдена');
    return this.findCard(cardId);
  }

  static async updateCardStatus(cardId, cardStatusId) {
    const res = await pool.query('UPDATE kanban_card SET card_status_id = $1 WHERE id = $2 RETURNING id;', [cardStatusId, cardId]);
    if (res.rows.length === 0) throw new Error('404: Карточка не найдена');
    return this.findCard(cardId);
  }

  static async deleteCard(cardId) {
    const card = await this.findCard(cardId);
    if (!card) return undefined;
    const keys = await FileRepository.uploadKeysWhere('f.kanban_card_id = $1', [cardId]);
    await inTransaction(async (client) => {
      await client.query('DELETE FROM kanban_card WHERE id = $1;', [cardId]);
      const ids = (
        await client.query('SELECT id FROM kanban_card WHERE kanban_column_id = $1 ORDER BY position, id;', [card.kanban_column_id])
      ).rows.map((r) => r.id);
      await writeOrder(client, 'kanban_card', ids);
    });
    for (const k of keys) await removeFile(k);
    return { id: card.id };
  }

  // ===== Исполнители и теги карточки ======================================

  static async #addParticipant(client, cardId, projectParticipantId, todoTaskId) {
    const ok = await client.query(
      `SELECT 1 FROM project_participants pp JOIN task t ON t.project_id = pp.project_id
       WHERE pp.id = $1 AND t.id = $2;`,
      [projectParticipantId, todoTaskId]
    );
    if (ok.rows.length === 0) throw new Error('400: Участник не состоит в этом проекте');
    await client.query(
      'INSERT INTO card_participants (kanban_card_id, project_participant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
      [cardId, projectParticipantId]
    );
  }

  static async #applyTag(client, cardId, tagId, todoTaskId) {
    const ok = await client.query(
      `SELECT 1 FROM kanban_tag g JOIN task t ON t.project_id = g.project_id WHERE g.id = $1 AND t.id = $2;`,
      [tagId, todoTaskId]
    );
    if (ok.rows.length === 0) throw new Error('400: Тег не принадлежит этому проекту');
    await client.query(
      'INSERT INTO kanban_tags_applies (kanban_tag_id, kanban_card_id) VALUES ($1, $2) ON CONFLICT DO NOTHING;',
      [tagId, cardId]
    );
  }

  static async #todoOfCard(cardId) {
    const r = await pool.query(
      'SELECT kc.todo_task_id FROM kanban_card c JOIN kanban_column kc ON kc.id = c.kanban_column_id WHERE c.id = $1;',
      [cardId]
    );
    if (r.rows.length === 0) throw new Error('404: Карточка не найдена');
    return r.rows[0].todo_task_id;
  }

  static async addCardParticipant(cardId, projectParticipantId) {
    const todo = await this.#todoOfCard(cardId);
    await this.#addParticipant(pool, cardId, projectParticipantId, todo);
    return { cardId: Number(cardId), projectParticipantId: Number(projectParticipantId) };
  }

  static async removeCardParticipant(cardId, projectParticipantId) {
    const res = await pool.query(
      'DELETE FROM card_participants WHERE kanban_card_id = $1 AND project_participant_id = $2 RETURNING *;',
      [cardId, projectParticipantId]
    );
    return res.rows[0];
  }

  static async applyTag(cardId, tagId) {
    const todo = await this.#todoOfCard(cardId);
    await this.#applyTag(pool, cardId, tagId, todo);
    return { cardId: Number(cardId), tagId: Number(tagId) };
  }

  static async removeTag(cardId, tagId) {
    const res = await pool.query('DELETE FROM kanban_tags_applies WHERE kanban_card_id = $1 AND kanban_tag_id = $2 RETURNING *;', [
      cardId,
      tagId,
    ]);
    return res.rows[0];
  }
}
