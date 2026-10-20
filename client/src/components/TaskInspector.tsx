import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { TaskNode, TaskTag } from '../types';
import { TASK_STATUSES, statusById } from '../utils/status';
import { endIso, inputToDay, isoToInput, startIso } from '../utils/dates';
import Icon from './Icon';

interface Props {
  task: TaskNode;
  canEdit: boolean;
  /** Все теги задач проекта — из них выбираются теги задачи */
  projectTags: TaskTag[];
  onChanged: () => Promise<void> | void;
  onClose: () => void;
  onOpen: (task: TaskNode) => void;
}

/** Панель выбранной задачи: переименование, даты, удаление. */
export default function TaskInspector({ task, canEdit, projectTags, onChanged, onClose, onOpen }: Props) {
  const origStart = task.start_date ? isoToInput(task.start_date) : '';
  const origEnd = task.end_date ? isoToInput(task.end_date) : '';

  const [title, setTitle] = useState(task.title);
  const [start, setStart] = useState(origStart);
  const [end, setEnd] = useState(origEnd);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setTitle(task.title);
    setStart(origStart);
    setEnd(origEnd);
    setError('');
    setConfirmDelete(false);
  }, [task.id, task.title, origStart, origEnd]);

  const isRoadmap = task.type === 'ROADMAP';
  const dirty = title.trim() !== task.title || start !== origStart || end !== origEnd;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return setError('Название не может быть пустым');
    if (!start || !end) return setError('Укажите даты начала и окончания');
    if (inputToDay(start) > inputToDay(end)) return setError('Дата начала позже даты окончания');

    setBusy(true);
    setError('');
    try {
      if (cleanTitle !== task.title) await api.tasks.updateTitle(task.id, cleanTitle);
      if (start !== origStart || end !== origEnd) {
        await api.tasks.updateDates(task.id, startIso(start), endIso(end));
      }
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (statusId: number) => {
    setBusy(true);
    setError('');
    try {
      await api.tasks.setStatus(task.id, statusId);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сменить статус');
    } finally {
      setBusy(false);
    }
  };

  const toggleTag = async (tagId: number) => {
    const ids = task.tags.map((t) => t.id);
    const next = ids.includes(tagId) ? ids.filter((x) => x !== tagId) : [...ids, tagId];
    setBusy(true);
    setError('');
    try {
      await api.taskTags.setForTask(task.id, next);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось изменить теги');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await api.tasks.remove(task.id);
      onClose();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить');
      setBusy(false);
    }
  };

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <span className={isRoadmap ? 'badge badge-roadmap' : 'badge badge-todo'}>
          <Icon name={isRoadmap ? 'roadmap' : 'tasks'} size={14} />
          {isRoadmap ? 'RoadMap' : 'ToDo'}
        </span>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть панель">
          <Icon name="close" size={18} />
        </button>
      </div>

      <label className="field">
        <span>Статус</span>
        <select
          className="status-select"
          value={task.status_id}
          disabled={!canEdit || busy}
          style={{ borderLeft: `6px solid ${statusById(task.status_id).color}` }}
          onChange={(e) => changeStatus(Number(e.target.value))}
        >
          {TASK_STATUSES.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span>Теги</span>
        {projectTags.length === 0 ? (
          <p className="muted hint">В проекте нет тегов. Создайте их в «Настройки → Теги задач».</p>
        ) : (
          <div className="tag-picker">
            {projectTags.map((t) => {
              const on = task.tags.some((x) => x.id === t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!canEdit || busy}
                  className={on ? 'fchip on' : 'fchip'}
                  onClick={() => toggleTag(t.id)}
                >
                  <i className="dot" style={{ background: t.color_code }} />
                  {t.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <form onSubmit={save}>
        <label className="field">
          <span>Название</span>
          <input
            value={title}
            maxLength={200}
            disabled={!canEdit}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="date-grid">
          <label className="field">
            <span>Начало</span>
            <input
              type="date"
              value={start}
              disabled={!canEdit}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Окончание</span>
            <input
              type="date"
              value={end}
              disabled={!canEdit}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>

        {error && <div className="notice notice-err">{error}</div>}

        {canEdit && (
          <button className="btn btn-primary btn-block" disabled={busy || !dirty}>
            Сохранить
          </button>
        )}
      </form>

      {isRoadmap && (
        <button className="btn btn-secondary btn-block inspector-gap" onClick={() => onOpen(task)}>
          Открыть RoadMap{task.children.length > 0 ? ` (${task.children.length})` : ''}
        </button>
      )}

      {canEdit &&
        (confirmDelete ? (
          <div className="confirm">
            <p>
              Удалить задачу?
              {isRoadmap && task.children.length > 0 && ' Вложенные задачи тоже будут удалены.'}
            </p>
            <div className="confirm-actions">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Отмена
              </button>
              <button className="btn btn-danger" onClick={remove} disabled={busy}>
                Удалить
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-danger-ghost btn-block inspector-gap"
            onClick={() => setConfirmDelete(true)}
          >
            <Icon name="trash" size={16} />
            Удалить
          </button>
        ))}
    </aside>
  );
}
