import { useCallback, useEffect, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { api } from '../api';
import type { StorageFile, StorageFolder } from '../types';
import { MAX_UPLOAD_MB, formatSize, tooBig } from '../utils/format';
import Icon from './Icon';
import Modal from './Modal';

interface Props {
  projectId: number;
  /** WRITE: создавать хранилища, загружать и удалять файлы */
  canWrite: boolean;
  /** EXECUTE: удалять хранилища целиком */
  canDelete: boolean;
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

/** Хранилища проекта — полоса под главной RoadMap. Внутри хранилища: файлы (на сервере) и ссылки. */
export default function StoragesSection({ projectId, canWrite, canDelete }: Props) {
  const [folders, setFolders] = useState<StorageFolder[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setFolders(await api.storage.list(projectId));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить хранилища');
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem('name') as HTMLInputElement).value.trim();
    if (!name) return;
    try {
      const folder = await api.storage.createFolder(projectId, name);
      setCreating(false);
      await load();
      setOpenId(folder.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать хранилище');
    }
  };

  const open = folders.find((f) => f.id === openId) ?? null;

  return (
    <section className="storages" aria-label="Хранилища проекта">
      <h2 className="storages-title">Хранилища</h2>
      <div className="storages-row">
        {folders.map((f) => (
          <button key={f.id} className="storage-card" onClick={() => setOpenId(f.id)}>
            <Icon name="folder" size={20} />
            <span className="storage-name">{f.name}</span>
            <span className="storage-count">{f.files.length}</span>
          </button>
        ))}
        {folders.length === 0 && !creating && <span className="muted">Хранилищ пока нет</span>}
        {canWrite &&
          (creating ? (
            <form className="storage-create" onSubmit={create}>
              <input name="name" autoFocus maxLength={100} placeholder="Название хранилища" onKeyDown={(e) => e.key === 'Escape' && setCreating(false)} />
              <button className="btn btn-primary">Создать</button>
              <button type="button" className="btn btn-quiet" onClick={() => setCreating(false)}>
                Отмена
              </button>
            </form>
          ) : (
            <button className="storage-card storage-new" onClick={() => setCreating(true)}>
              <Icon name="plus" size={18} />
              Создать хранилище
            </button>
          ))}
      </div>
      {error && <div className="notice notice-err">{error}</div>}

      {open && (
        <StorageModal
          folder={open}
          canWrite={canWrite}
          canDelete={canDelete}
          onChanged={load}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}

function StorageModal({
  folder,
  canWrite,
  canDelete,
  onChanged,
  onClose,
}: {
  folder: StorageFolder;
  canWrite: boolean;
  canDelete: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description ?? '');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [over, setOver] = useState(false);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Операция не выполнена');
    } finally {
      setBusy(false);
    }
  };

  const upload = (files: File[]) => {
    if (files.length === 0) return;
    const big = files.find(tooBig);
    if (big) return setError(`Файл «${big.name}» больше ${MAX_UPLOAD_MB} МБ`);
    run(async () => {
      for (const f of files) await api.storage.uploadFile(folder.id, f);
    });
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    if (canWrite) upload([...e.dataTransfer.files]);
  };

  const rename = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Введите название');
    run(() => api.storage.updateFolder(folder.id, { name: name.trim(), description: description.trim() }));
  };

  const dirty = name !== folder.name || description !== (folder.description ?? '');

  return (
    <Modal title={`Хранилище «${folder.name}»`} onClose={onClose} wide>
      {canWrite && (
        <form className="card-form" onSubmit={rename}>
          <div className="card-grid storage-head-grid">
            <label className="field">
              <span>Название</span>
              <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span>Описание</span>
              <input value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <button className="btn btn-secondary" disabled={busy || !dirty}>
              Сохранить
            </button>
          </div>
        </form>
      )}
      {!canWrite && folder.description && <p className="muted">{folder.description}</p>}

      {error && <div className="notice notice-err">{error}</div>}

      <ul className="list storage-files">
        {folder.files.map((f: StorageFile) => (
          <li key={f.id} className="list-row">
            <Icon name={f.resource_type === 'FILE' ? 'tasks' : 'globe'} size={18} />
            <div className="list-main">
              {renaming?.id === f.id ? (
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = renaming.name.trim();
                    if (!v) return;
                    run(async () => {
                      await api.storage.updateFile(f.id, { name: v });
                      setRenaming(null);
                    });
                  }}
                >
                  <input autoFocus value={renaming.name} maxLength={255} onChange={(e) => setRenaming({ id: f.id, name: e.target.value })} onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)} />
                  <button className="btn btn-secondary" disabled={busy}>
                    OK
                  </button>
                </form>
              ) : f.resource_type === 'LINK' ? (
                <a href={f.resource_path} target="_blank" rel="noreferrer noopener">
                  {f.name}
                </a>
              ) : (
                <button type="button" className="link-btn" onClick={() => run(() => api.storage.download(f.id, f.name))}>
                  {f.name}
                </button>
              )}
              <span className="muted">
                {[f.resource_type === 'FILE' ? formatSize(f.size) : 'ссылка', f.uploader_name, dateFmt.format(new Date(f.created_at))]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {canWrite && (
              <span className="comment-actions">
                <button type="button" className="link-btn" onClick={() => setRenaming({ id: f.id, name: f.name })}>
                  Переименовать
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Удалить ${f.name}`}
                  disabled={busy}
                  onClick={() => window.confirm(`Удалить «${f.name}»?`) && run(() => api.storage.deleteFile(f.id))}
                >
                  <Icon name="trash" size={16} />
                </button>
              </span>
            )}
          </li>
        ))}
        {folder.files.length === 0 && <li className="muted">Хранилище пусто</li>}
      </ul>

      {canWrite && (
        <>
          <div
            className={`dropzone${over ? ' dropzone-over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <span>Перетащите файлы сюда или</span>
            <label className="btn btn-secondary">
              Выберите файлы
              <input
                type="file"
                multiple
                hidden
                disabled={busy}
                onChange={(e) => {
                  const picked = [...(e.target.files ?? [])];
                  e.target.value = '';
                  upload(picked);
                }}
              />
            </label>
            <span className="muted">до {MAX_UPLOAD_MB} МБ каждый</span>
          </div>

          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const url = linkUrl.trim();
              if (!url) return;
              run(async () => {
                await api.storage.addLink(folder.id, linkName.trim() || url, url);
                setLinkName('');
                setLinkUrl('');
              });
            }}
          >
            <input value={linkName} maxLength={255} placeholder="Название ссылки" onChange={(e) => setLinkName(e.target.value)} />
            <input value={linkUrl} placeholder="https://github.com/…" onChange={(e) => setLinkUrl(e.target.value)} />
            <button className="btn btn-secondary" disabled={busy || !linkUrl.trim()}>
              Добавить ссылку
            </button>
          </form>
        </>
      )}

      <div className="modal-actions card-actions">
        {canDelete ? (
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Удалить хранилище «${folder.name}» вместе со всеми файлами и ссылками (${folder.files.length})?`)) {
                run(async () => {
                  await api.storage.deleteFolder(folder.id);
                  onClose();
                });
              }
            }}
          >
            Удалить хранилище
          </button>
        ) : (
          <span />
        )}
        <button className="btn btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Modal>
  );
}
