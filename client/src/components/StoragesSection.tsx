import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { ProjectRole, StorageFolder } from '../types';
import { MAX_UPLOAD_MB, formatSize, tooBig } from '../utils/format';
import FileDrop from './FileDrop';
import Dropdown from './Dropdown';
import FileItem from './FileItem';
import Icon from './Icon';
import Modal from './Modal';

interface Props {
  projectId: number;
  /** EXECUTE (руководитель): создавать хранилища, загружать, менять, удалять, настраивать видимость */
  canManage: boolean;
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });

/** Хранилища проекта — полоса под главной RoadMap. Внутри хранилища: файлы (на сервере) и ссылки. */
export default function StoragesSection({ projectId, canManage }: Props) {
  const [roles, setRoles] = useState<ProjectRole[]>([]);
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

  // Список ролей нужен только тому, кто настраивает видимость
  useEffect(() => {
    if (canManage) api.roles.listByProject(projectId).then(setRoles).catch(() => setRoles([]));
  }, [canManage, projectId]);

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
            {f.visible_roles.length > 0 && (
              <span className="storage-lock" title={`Видят только: ${f.visible_roles.map((r) => r.name).join(', ')}`}>
                🔒
              </span>
            )}
            <span className="storage-count">{f.files.length}</span>
          </button>
        ))}
        {folders.length === 0 && !creating && <span className="muted">Хранилищ пока нет</span>}
        {canManage &&
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
          canManage={canManage}
          roles={roles}
          onChanged={load}
          onClose={() => setOpenId(null)}
        />
      )}
    </section>
  );
}

function StorageModal({
  folder,
  canManage,
  roles,
  onChanged,
  onClose,
}: {
  folder: StorageFolder;
  canManage: boolean;
  roles: ProjectRole[];
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const [description, setDescription] = useState(folder.description ?? '');
  const [showLink, setShowLink] = useState(false);
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

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

  const saveInfo = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Введите название');
    run(async () => {
      await api.storage.updateFolder(folder.id, { name: name.trim(), description: description.trim() });
      setEditing(false);
    });
  };

  return (
    <Modal title={folder.name} onClose={onClose} wide>
      {editing ? (
        <form className="storage-edit" onSubmit={saveInfo}>
          <label className="field">
            <span>Название</span>
            <input value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Описание</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="kadd-actions">
            <button className="btn btn-primary" disabled={busy}>
              Сохранить
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                setEditing(false);
                setName(folder.name);
                setDescription(folder.description ?? '');
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <p className="storage-sub">
          <span className="muted">{folder.description || 'Без описания'}</span>
          {canManage && (
            <button type="button" className="link-btn" onClick={() => setEditing(true)}>
              Изменить
            </button>
          )}
        </p>
      )}

      {canManage ? (
        <div className="field storage-vis">
          <span>Кто видит это хранилище</span>
          <div className="chips">
            {folder.visible_roles.length === 0 ? (
              <span className="fchip on-static">Все участники проекта</span>
            ) : (
              folder.visible_roles.map((r) => (
                <span key={r.id} className="fchip on-static">
                  {r.name}
                  <button
                    type="button"
                    className="chip-x"
                    aria-label={`Скрыть от роли ${r.name}`}
                    disabled={busy}
                    onClick={() =>
                      run(() => api.storage.setVisibility(folder.id, folder.visible_roles.filter((x) => x.id !== r.id).map((x) => x.id)))
                    }
                  >
                    ×
                  </button>
                </span>
              ))
            )}
            <Dropdown buttonClassName="add-chip" ariaLabel="Выбрать роли" title="Выбрать, кто видит" disabled={busy} button={<Icon name="plus" size={14} />}>
              <div className="pick-list">
                <button type="button" className="pick-item" onClick={() => run(() => api.storage.setVisibility(folder.id, []))}>
                  <span>Все участники проекта</span>
                  {folder.visible_roles.length === 0 && <Icon name="check" size={16} />}
                </button>
                {roles.map((r) => {
                  const on = folder.visible_roles.some((x) => x.id === r.id);
                  const next = on ? folder.visible_roles.filter((x) => x.id !== r.id) : [...folder.visible_roles, r];
                  return (
                    <button key={r.id} type="button" className="pick-item" onClick={() => run(() => api.storage.setVisibility(folder.id, next.map((x) => x.id)))}>
                      <span>{r.name}</span>
                      {on && <Icon name="check" size={16} />}
                    </button>
                  );
                })}
              </div>
            </Dropdown>
          </div>
          <span className="muted hint">Роль можно выбрать несколько; администраторы видят всё. Участник с несколькими ролями видит хранилище, если подходит любая.</span>
        </div>
      ) : (
        folder.visible_roles.length > 0 && <p className="muted">🔒 Доступно ролям: {folder.visible_roles.map((r) => r.name).join(', ')}</p>
      )}

      {error && <div className="notice notice-err">{error}</div>}

      <h3 className="section-title">Содержимое ({folder.files.length})</h3>
      {folder.files.length === 0 ? (
        <p className="storage-empty">Здесь пока ничего нет{canManage ? ' — загрузите первый файл ниже.' : '.'}</p>
      ) : (
        <ul className="fitems">
          {folder.files.map((f) =>
            renaming?.id === f.id ? (
              <li key={f.id} className="fitem">
                <form
                  className="inline-form fitem-rename"
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
                  <input
                    autoFocus
                    value={renaming.name}
                    maxLength={255}
                    aria-label="Новое название"
                    onChange={(e) => setRenaming({ id: f.id, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
                  />
                  <button className="btn btn-primary" disabled={busy}>
                    Сохранить
                  </button>
                  <button type="button" className="btn btn-quiet" onClick={() => setRenaming(null)}>
                    Отмена
                  </button>
                </form>
              </li>
            ) : (
              <FileItem
                key={f.id}
                kind={f.resource_type === 'FILE' ? 'file' : 'link'}
                name={f.name}
                href={f.resource_path}
                meta={[f.resource_type === 'FILE' ? formatSize(f.size) : f.resource_path, f.uploader_name, dateFmt.format(new Date(f.created_at))]
                  .filter(Boolean)
                  .join(' · ')}
                busy={busy}
                onDownload={() => run(() => api.storage.download(f.id, f.name))}
                onRename={canManage ? () => setRenaming({ id: f.id, name: f.name }) : undefined}
                onDelete={canManage ? () => window.confirm(`Удалить «${f.name}»?`) && run(() => api.storage.deleteFile(f.id)) : undefined}
              />
            ),
          )}
        </ul>
      )}

      {canManage && (
        <>
          <h3 className="section-title">Добавить</h3>
          <FileDrop onFiles={upload} disabled={busy} />
          {showLink ? (
            <form
              className="storage-link-form"
              onSubmit={(e) => {
                e.preventDefault();
                const url = linkUrl.trim();
                if (!url) return;
                run(async () => {
                  await api.storage.addLink(folder.id, linkName.trim() || url, url);
                  setLinkName('');
                  setLinkUrl('');
                  setShowLink(false);
                });
              }}
            >
              <input value={linkUrl} autoFocus placeholder="Адрес: https://github.com/…" onChange={(e) => setLinkUrl(e.target.value)} />
              <input value={linkName} maxLength={255} placeholder="Название (необязательно)" onChange={(e) => setLinkName(e.target.value)} />
              <button className="btn btn-primary" disabled={busy || !linkUrl.trim()}>
                Добавить
              </button>
              <button type="button" className="btn btn-quiet" onClick={() => setShowLink(false)}>
                Отмена
              </button>
            </form>
          ) : (
            <button type="button" className="link-btn storage-link-toggle" onClick={() => setShowLink(true)}>
              + Добавить ссылку (GitHub, Figma и т. п.)
            </button>
          )}
        </>
      )}

      <div className="modal-actions card-actions">
        {canManage ? (
          <button
            className="link-btn link-danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Удалить хранилище «${folder.name}» вместе со всем содержимым (${folder.files.length})? Это нельзя отменить.`)) {
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
