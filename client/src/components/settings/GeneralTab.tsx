import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { ProjectDetails } from '../../types';

interface Props {
  project: ProjectDetails;
  onChanged: () => Promise<void> | void;
}

/** Вкладка «Общие»: название, описание и удаление проекта. */
export default function GeneralTab({ project, onChanged }: Props) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(project.title);
  const [description, setDescription] = useState(project.description ?? '');
  const [confirmName, setConfirmName] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return setError('Введите название проекта');
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api.projects.update(project.id, { title: cleanTitle, description: description.trim() });
      await onChanged();
      setSaved(true);
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
      await api.projects.remove(project.id);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект');
      setBusy(false);
    }
  };

  return (
    <>
      <form onSubmit={save}>
        <label className="field">
          <span>Название</span>
          <input value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Описание</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <div className="notice notice-err">{error}</div>}
        {saved && <div className="notice notice-ok">Сохранено</div>}
        <div className="modal-actions">
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
    </>
  );
}
