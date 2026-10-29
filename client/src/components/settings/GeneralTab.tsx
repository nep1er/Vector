import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import { api, assetUrl } from '../../api';
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
  const [avatar, setAvatar] = useState<string | null>(project.avatar_url ?? null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const pickAvatar = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      return setError('Нужна картинка PNG, JPEG или WebP до 2 МБ');
    }
    setBusy(true);
    setError('');
    try {
      const p = await api.projects.uploadAvatar(project.id, file);
      setAvatar(p.avatar_url ?? null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить картинку');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const dropAvatar = async () => {
    setBusy(true);
    setError('');
    try {
      await api.projects.removeAvatar(project.id);
      setAvatar(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось убрать картинку');
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
      <div className="proj-avatar">
        <div className="proj-avatar-preview">
          {avatar ? <img src={assetUrl(avatar) ?? ''} alt="" /> : <span>{project.title.trim().charAt(0).toUpperCase()}</span>}
        </div>
        <div className="proj-avatar-actions">
          <b>Картинка проекта</b>
          <span className="muted">Показывается на главной вместо первой буквы названия. PNG, JPEG или WebP до 2 МБ.</span>
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} />
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {avatar ? 'Заменить' : 'Загрузить'}
            </button>{' '}
            {avatar && (
              <button type="button" className="btn btn-quiet" disabled={busy} onClick={dropAvatar}>
                Убрать
              </button>
            )}
          </div>
        </div>
      </div>

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
