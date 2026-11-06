import { useEffect, useMemo, useRef } from 'react';
import { api } from '../../api';
import { useAuth } from '../../auth/AuthContext';
import { useTheme } from '../../theme/ThemeContext';
import type { ExtPermission, KanbanColumn, TaskNode } from '../../types';

/**
 * Запуск расширения в изолированной песочнице.
 *
 * Безопасность:
 *  - iframe с sandbox="allow-scripts" БЕЗ allow-same-origin: у кода расширения «пустой» origin,
 *    он не видит localStorage/cookie/токен приложения и не может обращаться к API от имени пользователя;
 *  - файлы приходят с отдельного origin со строгой CSP (connect-src 'none': сеть закрыта);
 *  - единственный канал наружу — postMessage-мост ниже, в доверенном коде хоста.
 *    Мост проверяет: источник сообщения, выданные в проекте права, принадлежность id проекту,
 *    частоту вызовов; фактические права пользователя дополнительно проверяет сервер (запросы идут с его токеном);
 *  - каждое обращение к данным пишется в журнал проекта.
 */

const RATE_LIMIT = 40; // вызовов
const RATE_WINDOW_MS = 10_000;

type Handler = (params: any) => Promise<unknown>;

interface Props {
  src: string;
  title: string;
  extensionId: number;
  /** права, выданные расширению в проекте (в демо — все запрошенные манифестом) */
  permissions: ExtPermission[];
  projectId?: number;
  viewId?: string;
  /** демо-режим (предпросмотр автором/модератором): данные вымышленные, сеть и проект не затрагиваются */
  demo?: boolean;
  /** режим панели в карточке: высоту задаёт расширение через ui.resize */
  panel?: boolean;
  height?: number;
  context?: Record<string, unknown>;
  onHeight?: (h: number) => void;
}

const DEMO_TASKS = [
  { id: 1, type: 'ROADMAP', title: 'Подготовка', description: null, start_date: '2026-11-02', end_date: '2026-11-13', parent_id: null, status_id: 3 },
  { id: 2, type: 'ROADMAP', title: 'Разработка', description: null, start_date: '2026-11-09', end_date: '2026-12-04', parent_id: null, status_id: 2 },
  { id: 3, type: 'TODO', title: 'Макеты экранов', description: null, start_date: '2026-11-03', end_date: '2026-11-10', parent_id: 1, status_id: 5 },
  { id: 4, type: 'TODO', title: 'API и база данных', description: null, start_date: '2026-11-10', end_date: '2026-11-27', parent_id: 2, status_id: 2 },
  { id: 5, type: 'ROADMAP', title: 'Релиз', description: null, start_date: '2026-12-01', end_date: '2026-12-18', parent_id: null, status_id: 1 },
];
const DEMO_STATUSES = [
  { id: 1, name: 'Не начато' }, { id: 2, name: 'В процессе' }, { id: 3, name: 'Выполнено' },
  { id: 4, name: 'Отложено' }, { id: 5, name: 'На проверке' }, { id: 6, name: 'Заблокировано' },
];
const DEMO_MEMBERS = [
  { user_id: 1, username: 'Анна', avatar_url: null, roles: ['Руководитель'] },
  { user_id: 2, username: 'Пётр', avatar_url: null, roles: ['Разработчик'] },
];

const isDate = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const deny = (msg: string) => Promise.reject(Object.assign(new Error(msg), { code: 'DENIED' }));

function flatten(nodes: TaskNode[], parent: number | null = null, out: any[] = []) {
  for (const n of nodes) {
    out.push({
      id: n.id, type: n.type, title: n.title, description: n.description ?? null,
      start_date: n.start_date ? n.start_date.slice(0, 10) : null,
      end_date: n.end_date ? n.end_date.slice(0, 10) : null,
      parent_id: parent, status_id: n.status_id,
    });
    flatten(n.children ?? [], n.id, out);
  }
  return out;
}

export default function ExtensionFrame(p: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { user } = useAuth();
  const { pref } = useTheme();
  const theme: 'light' | 'dark' = pref.endsWith('dark') ? 'dark' : 'light';
  const perms = useMemo(() => new Set(p.permissions), [p.permissions]);
  const latest = useRef(p);
  latest.current = p;

  // Мост живёт, пока смонтирован iframe
  useEffect(() => {
    const known = { tasks: new Set<number>(), todos: new Set<number>(), cards: new Set<number>(), columns: new Set<number>() };
    const calls: number[] = [];
    const auditQueue: { method: string; ok: boolean }[] = [];
    let tasksLoaded: Promise<void> | null = null;

    const loadTasks = () =>
      (tasksLoaded ??= (async () => {
        const rows = p.demo ? DEMO_TASKS : flatten(await api.tasks.tree(p.projectId!));
        rows.forEach((r: any) => { known.tasks.add(r.id); if (r.type === 'TODO') known.todos.add(r.id); });
      })());
    const need = (perm: ExtPermission) => (perms.has(perm) ? null : deny(`Нет права ${perm}`));

    const handlers: Record<string, Handler> = {
      'tasks.list': async () => {
        const d = need('tasks:read'); if (d) return d;
        if (p.demo) { await loadTasks(); return DEMO_TASKS; }
        const rows = flatten(await api.tasks.tree(p.projectId!));
        rows.forEach((r) => { known.tasks.add(r.id); if (r.type === 'TODO') known.todos.add(r.id); });
        return rows;
      },
      'tasks.statuses': async () => {
        const d = need('tasks:read'); if (d) return d;
        return p.demo ? DEMO_STATUSES : (await api.tasks.statuses()).map((s: any) => ({ id: s.id, name: s.name }));
      },
      'tasks.updateDates': async (a) => {
        const d = need('tasks:write'); if (d) return d;
        await loadTasks();
        if (!isId(a?.id) || !known.tasks.has(a.id)) return deny('Задача не принадлежит проекту');
        if (!isDate(a.startDate) || !isDate(a.endDate)) return deny('Даты в формате ГГГГ-ММ-ДД');
        if (p.demo) return { ok: true };
        const t = await api.tasks.updateDates(a.id, a.startDate ?? undefined, a.endDate ?? undefined, false);
        return { id: t.id, start_date: t.start_date, end_date: t.end_date };
      },
      'tasks.setStatus': async (a) => {
        const d = need('tasks:write'); if (d) return d;
        await loadTasks();
        if (!isId(a?.id) || !known.tasks.has(a.id) || !isId(a?.statusId)) return deny('Некорректные параметры');
        if (p.demo) return { ok: true };
        const t = await api.tasks.setStatus(a.id, a.statusId);
        return { id: t.id, status_id: t.status_id };
      },
      'kanban.board': async (a) => {
        const d = need('kanban:read'); if (d) return d;
        await loadTasks();
        if (!isId(a?.todoId) || !known.todos.has(a.todoId)) return deny('ToDo не принадлежит проекту');
        if (p.demo) return [];
        const cols: KanbanColumn[] = await api.kanban.getBoard(a.todoId);
        return cols.map((c) => {
          known.columns.add(c.column_id);
          return {
            id: c.column_id, title: c.column_title, position: c.position,
            cards: c.cards.map((k) => {
              known.cards.add(k.id);
              return {
                id: k.id, title: k.title, done: k.status_id === 1, work_date: k.work_date ? k.work_date.slice(0, 10) : null,
                tags: k.tags.map((t) => ({ name: t.name, color: t.color_code })),
                assignees: k.participants.map((u) => u.username),
              };
            }),
          };
        });
      },
      'kanban.moveCard': async (a) => {
        const d = need('kanban:write'); if (d) return d;
        if (!isId(a?.cardId) || !known.cards.has(a.cardId) || !isId(a?.columnId) || !known.columns.has(a.columnId)) return deny('Карточка или колонка не из этого проекта');
        if (p.demo) return { ok: true };
        await api.kanban.moveCard(a.cardId, a.columnId, Number.isInteger(a.index) ? a.index : undefined);
        return { ok: true };
      },
      'members.list': async () => {
        const d = need('members:read'); if (d) return d;
        if (p.demo) return DEMO_MEMBERS;
        return (await api.projects.participants(p.projectId!)).map((m) => ({
          user_id: m.user_id, username: m.username, avatar_url: m.avatar_url, roles: m.roles.map((r) => r.name),
        }));
      },
      'storage.list': async () => {
        const d = need('storage:read'); if (d) return d;
        if (p.demo) return [{ id: 1, name: 'Документы', files: [{ id: 1, name: 'ТЗ.pdf' }] }];
        return (await api.storage.list(p.projectId!)).map((s) => ({
          id: s.id, name: s.name, files: s.files.map((f) => ({ id: f.id, name: f.name })),
        }));
      },
      'ui.resize': async (a) => {
        if (!perms.has('ui:task-panel') && !perms.has('ui:view')) return deny('Нет права на интерфейс');
        const h = Math.min(600, Math.max(80, Math.round(Number(a?.height) || 0)));
        latest.current.onHeight?.(h);
        return { height: h };
      },
    };

    const flush = () => {
      if (p.demo || !p.projectId || auditQueue.length === 0) return;
      const entries = auditQueue.splice(0, 50);
      api.extensions.recordAudit(p.projectId, p.extensionId, entries).catch(() => {});
    };
    const timer = window.setInterval(flush, 5000);

    const reply = (id: unknown, body: Record<string, unknown>) =>
      ref.current?.contentWindow?.postMessage({ vector: 1, id, ...body }, '*');

    const context = () => ({
      projectId: p.projectId ?? null, viewId: p.viewId ?? null, demo: !!p.demo,
      user: user ? { id: user.id, username: user.username } : null,
      theme: theme, permissions: p.permissions, ...(p.context ?? {}),
    });

    const onMessage = async (ev: MessageEvent) => {
      if (ev.source !== ref.current?.contentWindow) return; // только наш iframe
      const m = ev.data;
      if (!m || m.vector !== 1 || typeof m !== 'object') return;
      if (m.event === 'hello') { reply(null, { event: 'ready', context: context() }); return; }
      if (typeof m.method !== 'string') return;

      const now = Date.now();
      while (calls.length && now - calls[0] > RATE_WINDOW_MS) calls.shift();
      if (calls.length >= RATE_LIMIT) return reply(m.id, { ok: false, error: { code: 'RATE_LIMIT', message: 'Слишком много запросов' } });
      calls.push(now);

      const fn = Object.prototype.hasOwnProperty.call(handlers, m.method) ? handlers[m.method] : null;
      if (!fn) return reply(m.id, { ok: false, error: { code: 'UNKNOWN', message: `Неизвестный метод ${String(m.method).slice(0, 40)}` } });
      try {
        const result = await fn(m.params);
        if (m.method !== 'ui.resize') auditQueue.push({ method: m.method, ok: true });
        reply(m.id, { ok: true, result });
      } catch (e: any) {
        auditQueue.push({ method: m.method, ok: false });
        reply(m.id, { ok: false, error: { code: e?.code ?? 'ERROR', message: String(e?.message ?? 'Ошибка') } });
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
      flush();
    };
    // мост пересоздаётся только при смене самого расширения/проекта
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.src, p.projectId, p.extensionId, p.demo, perms]);

  // смена темы приложения — сообщаем расширению
  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ vector: 1, event: 'theme', theme }, '*');
  }, [theme]);

  return (
    <iframe
      ref={ref}
      className={p.panel ? 'ext-frame ext-frame-panel' : 'ext-frame'}
      title={p.title}
      src={p.src}
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      loading="lazy"
      style={p.panel ? { height: p.height ?? 160 } : undefined}
    />
  );
}
