import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api';
import type { TaskTag } from '../../types';
import Icon from '../Icon';

const DEFAULT_COLOR = '#3b82f6';

/** Вкладка «Теги задач»: CRUD тегов task_tag (не путать с тегами карточек Канбана). */
export default function TagsTab({ projectId, onChanged }: { projectId: number; onChanged: () => Promise<void> | void }) {
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [drafts, setDrafts] = useState<Record<number, { name: string; color: string }>>({});
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await api.taskTags.listByProject(projectId);
      setTags(list);
      setDrafts(Object.fromEntries(list.map((t) => [t.id, { name: t.name, color: t.color_code }])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить теги');
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Операция не выполнена');
    } finally {
      setBusy(false);
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    run(async () => {
      await api.taskTags.create(projectId, name, newColor);
      setNewName('');
    });
  };

  return (
    <>
      <form className="inline-form" onSubmit={create}>
        <input
          type="color"
          className="color-input"
          aria-label="Цвет тега"
          value={newColor}
          onChange={(e) => setNewColor(e.target.value)}
        />
        <input
          value={newName}
          maxLength={50}
          placeholder="Название нового тега"
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="btn btn-primary" disabled={busy || !newName.trim()}>
          <Icon name="plus" size={18} />
          Создать
        </button>
      </form>

      {error && <div className="notice notice-err">{error}</div>}

      {tags.length === 0 ? (
        <p className="muted">Тегов пока нет. Теги можно назначать задачам в панели задачи.</p>
      ) : (
        <ul className="list">
          {tags.map((tag) => {
            const d = drafts[tag.id] ?? { name: tag.name, color: tag.color_code };
            const dirty = d.name.trim() !== tag.name || d.color.toLowerCase() !== tag.color_code.toLowerCase();
            return (
              <li key={tag.id} className="list-row">
                <input
                  type="color"
                  className="color-input"
                  aria-label={`Цвет тега ${tag.name}`}
                  value={d.color}
                  onChange={(e) => setDrafts({ ...drafts, [tag.id]: { ...d, color: e.target.value } })}
                />
                <input
                  aria-label="Название тега"
                  value={d.name}
                  maxLength={50}
                  onChange={(e) => setDrafts({ ...drafts, [tag.id]: { ...d, name: e.target.value } })}
                />
                <span className="muted count" title="Задач с этим тегом">
                  {tag.tasks_count ?? 0}
                </span>
                <button
                  className="btn btn-quiet"
                  disabled={busy || !dirty || !d.name.trim()}
                  onClick={() =>
                    run(() => api.taskTags.update(tag.id, { name: d.name.trim(), colorCode: d.color }))
                  }
                >
                  Сохранить
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Удалить тег ${tag.name}`}
                  disabled={busy}
                  onClick={() => run(() => api.taskTags.remove(tag.id))}
                >
                  <Icon name="trash" size={18} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
