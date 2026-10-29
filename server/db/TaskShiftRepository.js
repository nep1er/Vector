import { pool } from '../config/db.js';
import { TaskRepository } from './TaskRepository.js';

const DAY = 86_400_000;
const DONE_STATUS_ID = 1;
const MAX_SHIFT_DAYS = 3650;

/** Разбор и проверка параметров смещения */
export function parseShift({ roadmapId, fromDate, days }) {
  const rid = Number(roadmapId);
  if (!Number.isInteger(rid)) throw new Error('400: Укажите roadmapId');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate ?? '')) || Number.isNaN(Date.parse(`${fromDate}T00:00:00Z`))) {
    throw new Error('400: Укажите дату в формате ГГГГ-ММ-ДД');
  }
  const d = Number(days);
  if (!Number.isInteger(d) || d === 0 || Math.abs(d) > MAX_SHIFT_DAYS) {
    throw new Error(`400: Срок — целое число дней от 1 до ${MAX_SHIFT_DAYS} (со знаком «минус» — перенос назад)`);
  }
  return { roadmapId: rid, fromDate: String(fromDate), days: d };
}

const shiftIso = (iso, days) => (iso ? new Date(new Date(iso).getTime() + days * DAY).toISOString() : null);

/**
 * «Смещение сроков»: все задачи выбранного уровня RoadMap (и вложенные), которые заканчиваются
 * в выбранную дату или позже, целиком переносятся на N дней с сохранением длительности.
 *  - задача с вложенными переносится вместе со всем содержимым;
 *  - выполненные задачи, не затронутые родителем, остаются как есть;
 *  - задачи без дат пропускаются;
 *  - границы этой RoadMap и объемлющих растягиваются, если перенесённое в них не помещается.
 * Видимость учитывается: затрагиваются только задачи, которые видит выполняющий (администратор видит все).
 */
export class TaskShiftRepository {
  /** Рассчитывает, что изменится, ничего не записывая */
  static async plan(projectId, { roadmapId, fromDate, days }, { userId, seeAll }) {
    const tree = await TaskRepository.getProjectTree(projectId, { userId, seeAll });
    const stack = [];
    const find = (nodes, trail) => {
      for (const n of nodes) {
        const next = [...trail, n];
        if (n.id === roadmapId) return next;
        const f = find(n.children, next);
        if (f) return f;
      }
      return null;
    };
    const path = find(tree, []);
    if (!path) throw new Error('404: RoadMap не найдена в проекте');
    const scope = path[path.length - 1];
    if (scope.type !== 'ROADMAP') throw new Error('400: Смещение выполняется на уровне RoadMap');

    const fromMs = Date.parse(`${fromDate}T00:00:00Z`);
    const items = [];

    const visit = (node, followParent) => {
      const dated = node.start_date || node.end_date;
      let selected = followParent;
      if (!selected && dated && node.status_id !== DONE_STATUS_ID) {
        const edge = new Date(node.end_date ?? node.start_date).getTime();
        selected = edge >= fromMs;
      }
      if (selected && dated) {
        items.push({
          id: node.id,
          title: node.title,
          type: node.type,
          status_id: node.status_id,
          old_start: node.start_date,
          old_end: node.end_date,
          new_start: shiftIso(node.start_date, days),
          new_end: shiftIso(node.end_date, days),
          is_container: false,
        });
      }
      // дети переносятся вместе с перенесённым родителем
      for (const child of node.children) visit(child, selected && !!dated);
    };
    for (const child of scope.children) visit(child, false);
    void stack;

    // Границы RoadMap и её предков должны вмещать перенесённое
    const containers = [];
    if (items.length > 0) {
      const minStart = Math.min(...items.filter((i) => i.new_start).map((i) => new Date(i.new_start).getTime()));
      const maxEnd = Math.max(...items.filter((i) => i.new_end).map((i) => new Date(i.new_end).getTime()));
      for (const c of path) {
        let ns = c.start_date;
        let ne = c.end_date;
        if (Number.isFinite(minStart) && c.start_date && new Date(c.start_date).getTime() > minStart) ns = new Date(minStart).toISOString();
        if (Number.isFinite(maxEnd) && c.end_date && new Date(c.end_date).getTime() < maxEnd) ne = new Date(maxEnd).toISOString();
        if (ns !== c.start_date || ne !== c.end_date) {
          containers.push({
            id: c.id,
            title: c.title,
            type: c.type,
            status_id: c.status_id,
            old_start: c.start_date,
            old_end: c.end_date,
            new_start: ns,
            new_end: ne,
            is_container: true,
          });
        }
      }
    }
    return { scope: { id: scope.id, title: scope.title }, items, containers };
  }

  static async apply(projectId, params, { userId, seeAll, comment }) {
    const plan = await this.plan(projectId, params, { userId, seeAll });
    if (plan.items.length === 0) throw new Error('400: С этой даты нет задач для переноса');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const all = [...plan.items, ...plan.containers];
      // Блокируем затрагиваемые задачи и убеждаемся, что даты не менялись с момента расчёта
      const locked = await client.query(
        'SELECT id, start_date, end_date FROM task WHERE id = ANY($1::bigint[]) FOR UPDATE;',
        [all.map((i) => i.id)]
      );
      const cur = new Map(locked.rows.map((r) => [r.id, r]));
      for (const it of all) {
        const row = cur.get(it.id);
        const same = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
        if (!row || !same(row.start_date, it.old_start) || !same(row.end_date, it.old_end)) {
          throw new Error('409: Сроки задач изменились, пока вы готовили смещение — откройте окно заново');
        }
      }
      // Сначала растягиваем контейнеры, чтобы проверки включения дат не срабатывали
      for (const it of [...plan.containers, ...plan.items]) {
        await client.query('UPDATE task SET start_date = $1, end_date = $2 WHERE id = $3;', [it.new_start, it.new_end, it.id]);
      }
      const shift = (
        await client.query(
          `INSERT INTO task_shift (project_id, roadmap_id, roadmap_title, from_date, shift_days, tasks_count, comment, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *;`,
          [projectId, plan.scope.id, plan.scope.title, params.fromDate, params.days, plan.items.length, comment?.trim() || null, userId]
        )
      ).rows[0];
      for (const it of all) {
        await client.query(
          `INSERT INTO task_shift_item (shift_id, task_id, task_title, task_type, is_container, old_start, old_end, new_start, new_end)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
          [shift.id, it.id, it.title, it.type, it.is_container, it.old_start, it.old_end, it.new_start, it.new_end]
        );
      }
      await client.query('COMMIT');
      return { ...shift, containers_extended: plan.containers.length };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** История смещений проекта, новые сверху */
  static async history(projectId) {
    const res = await pool.query(
      `SELECT s.id, s.roadmap_id, s.roadmap_title, s.from_date::text AS from_date, s.shift_days, s.tasks_count, s.comment,
              s.created_at, s.created_by, u.username AS created_by_name,
              s.reverted_at, ru.username AS reverted_by_name
       FROM task_shift s
       LEFT JOIN users u ON u.id = s.created_by
       LEFT JOIN users ru ON ru.id = s.reverted_by
       WHERE s.project_id = $1
       ORDER BY s.created_at DESC, s.id DESC;`,
      [projectId]
    );
    return res.rows;
  }

  static async findShift(shiftId) {
    const res = await pool.query('SELECT * FROM task_shift WHERE id = $1;', [shiftId]);
    return res.rows[0];
  }

  static async items(shiftId) {
    const res = await pool.query(
      `SELECT id, task_id, task_title, task_type, is_container, old_start, old_end, new_start, new_end
       FROM task_shift_item WHERE shift_id = $1 ORDER BY is_container DESC, old_start NULLS LAST, id;`,
      [shiftId]
    );
    return res.rows;
  }

  /**
   * Отмена: возвращает прежние даты тем задачам, у которых сейчас те же даты, что дало смещение.
   * Если задачу с тех пор двигали вручную — она пропускается и остаётся как есть.
   */
  static async undo(shiftId, userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const shift = (await client.query('SELECT * FROM task_shift WHERE id = $1 FOR UPDATE;', [shiftId])).rows[0];
      if (!shift) throw new Error('404: Смещение не найдено');
      if (shift.reverted_at) throw new Error('409: Это смещение уже отменено');

      const items = (
        await client.query('SELECT * FROM task_shift_item WHERE shift_id = $1 AND task_id IS NOT NULL ORDER BY is_container ASC, id;', [shiftId])
      ).rows;
      const ids = items.map((i) => i.task_id);
      const cur = new Map(
        (await client.query('SELECT id, start_date, end_date FROM task WHERE id = ANY($1::bigint[]) FOR UPDATE;', [ids])).rows.map((r) => [r.id, r])
      );
      const same = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
      let restored = 0;
      let skipped = 0;
      // задачи — раньше контейнеров: сначала возвращаем содержимое, затем сужаем границы
      for (const it of items) {
        const row = cur.get(it.task_id);
        if (row && same(row.start_date, it.new_start) && same(row.end_date, it.new_end)) {
          await client.query('UPDATE task SET start_date = $1, end_date = $2 WHERE id = $3;', [it.old_start, it.old_end, it.task_id]);
          if (!it.is_container) restored++;
        } else if (!it.is_container) {
          skipped++;
        }
      }
      await client.query('UPDATE task_shift SET reverted_at = CURRENT_TIMESTAMP, reverted_by = $1 WHERE id = $2;', [userId, shiftId]);
      await client.query('COMMIT');
      return { id: Number(shiftId), restored, skipped };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}
