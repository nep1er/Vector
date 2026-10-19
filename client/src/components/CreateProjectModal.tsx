import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { Project } from '../types';

interface Props {
  onClose: () => void;
  onCreated: (project: Project) => void;
}

export default function CreateProjectModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Закрытие по Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return setError('Введите название проекта');
    if (trimmed.length > 150) return setError('Название не должно быть длиннее 150 символов');

    setBusy(true);
    setError('');
    try {
      const project = await api.projects.create(trimmed, description.trim() || undefined);
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать проект');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="create-title">Новый проект</h2>
        <p className="muted">
          Вместе с проектом автоматически создастся главный план (корневая RoadMap).
        </p>

        <label className="field">
          <span>Название</span>
          <input
            autoFocus
            value={title}
            maxLength={150}
            placeholder="Например, Разработка мобильного приложения"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <label className="field">
          <span>Описание (необязательно)</span>
          <textarea
            rows={4}
            value={description}
            placeholder="Коротко: о чём проект и какая у него цель"
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        {error && <div className="notice notice-err">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Создаём…' : 'Создать проект'}
          </button>
        </div>
      </form>
    </div>
  );
}
