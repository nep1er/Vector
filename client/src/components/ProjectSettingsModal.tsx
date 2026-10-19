import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { ProjectDetails } from '../types';

interface Props {
  project: ProjectDetails;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

export default function ProjectSettingsModal({ project, onClose, onSaved }: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? '');
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return setError('Введите название проекта');
    setBusy(true);
    setError('');
    try {
      await api.projects.update(project.id, { title: cleanTitle, description: description.trim() });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await api.projects.remove(project.id);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title">Настройки проекта</h2>

        <form onSubmit={save}>
          <label className="field">
            <span>Название</span>
            <input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Описание</span>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
              Закрыть
            </button>
            <button className="btn btn-primary" disabled={busy}>
              Сохранить
            </button>
          </div>
        </form>

        <div className="danger-block">
          <h3>Удаление проекта</h3>
          <p className="muted">
            Проект, все его задачи и доски будут удалены безвозвратно. Для подтверждения введите
            название проекта.
          </p>
          <input
            value={confirmName}
            placeholder={project.title}
            onChange={(e) => setConfirmName(e.target.value)}
          />
          <button
            className="btn btn-danger"
            onClick={remove}
            disabled={busy || confirmName.trim() !== project.title}
          >
            Удалить проект
          </button>
        </div>

        {error && <div className="notice notice-err">{error}</div>}
      </div>
    </div>
  );
}
