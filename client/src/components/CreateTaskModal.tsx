import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { TaskNode } from '../types';
import { dayToInput, endIso, inputToDay, isoToInput, startIso, todayIndex } from '../utils/dates';
import Icon from './Icon';

interface Props {
  projectId: number;
  parent: TaskNode;
  canRoadmap: boolean;
  canTodo: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}

type Kind = 'ROADMAP' | 'TODO';

export default function CreateTaskModal({ projectId, parent, canRoadmap, canTodo, onClose, onCreated }: Props) {
  const minDate = parent.start_date ? isoToInput(parent.start_date) : undefined;
  const maxDate = parent.end_date ? isoToInput(parent.end_date) : undefined;

  // Даты по умолчанию: две недели от сегодня, но внутри границ родительского этапа
  const defaults = () => {
    let s = todayIndex();
    if (minDate) s = Math.max(s, inputToDay(minDate));
    if (maxDate) s = Math.min(s, inputToDay(maxDate));
    let e = s + 13;
    if (maxDate) e = Math.min(e, inputToDay(maxDate));
    return { s: dayToInput(s), e: dayToInput(e) };
  };

  const [kind, setKind] = useState<Kind>(canRoadmap ? 'ROADMAP' : 'TODO');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState(() => defaults().s);
  const [end, setEnd] = useState(() => defaults().e);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return setError('Введите название');
    if (!start || !end) return setError('Укажите даты начала и окончания');
    if (inputToDay(start) > inputToDay(end)) return setError('Дата начала позже даты окончания');

    setBusy(true);
    setError('');
    try {
      if (kind === 'ROADMAP') {
        await api.tasks.createRoadmapStage(projectId, {
          title: cleanTitle,
          startDate: startIso(start),
          endDate: endIso(end),
          parentRoadmapId: parent.id,
        });
      } else {
        await api.tasks.createTodo(projectId, cleanTitle, parent.id, startIso(start), endIso(end));
      }
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать задачу');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="task-title">Новая задача</h2>

        <div className="field">
          <span>Тип</span>
          <div className="segmented" role="radiogroup" aria-label="Тип задачи">
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'ROADMAP'}
              disabled={!canRoadmap}
              onClick={() => setKind('ROADMAP')}
            >
              <Icon name="roadmap" size={16} />
              RoadMap
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === 'TODO'}
              disabled={!canTodo}
              onClick={() => setKind('TODO')}
            >
              <Icon name="tasks" size={16} />
              ToDo
            </button>
          </div>
        </div>

        <label className="field">
          <span>Название</span>
          <input
            autoFocus
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="date-grid">
          <label className="field">
            <span>Начало</span>
            <input
              type="date"
              value={start}
              min={minDate}
              max={maxDate}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Окончание</span>
            <input
              type="date"
              value={end}
              min={minDate}
              max={maxDate}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>

        {error && <div className="notice notice-err">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Создаём…' : 'Создать'}
          </button>
        </div>
      </form>
    </div>
  );
}
