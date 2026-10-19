import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { TaskNode } from '../types';
import { endIso, inputToDay, isoToInput, startIso } from '../utils/dates';
import Icon from './Icon';

interface Props {
  task: TaskNode;
  canEdit: boolean;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
  onOpen: (task: TaskNode) => void;
}

/** Панель выбранной задачи: переименование, даты, удаление. */
export default function TaskInspector({ task, canEdit, onChanged, onClose, onOpen }: Props) {
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
