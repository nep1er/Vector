import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { CardComment, CardFile, KanbanCard, KanbanColumn, KanbanTag, Participant } from '../types';
import Avatar from './Avatar';
import Dropdown from './Dropdown';
import Icon from './Icon';
import FileDrop from './FileDrop';
import FileItem from './FileItem';
import { MAX_UPLOAD_MB, formatSize, tooBig } from '../utils/format';

interface Props {
  card: KanbanCard;
  projectId: number;
  columns: KanbanColumn[];
  projectTags: KanbanTag[];
  participants: Participant[];
  /** EXECUTE (руководитель): править карточку, теги, исполнителей, вложения */
  canEdit: boolean;
  /** WRITE (участник): переносить в другую колонку */
  canMove: boolean;
  /** WRITE (участник): писать комментарии */
  canComment: boolean;
  /** Admin может удалять чужие комментарии */
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Окно карточки: все поля, теги, исполнители, перенос в другую колонку, файлы и комментарии. */
export default function CardModal({ card, projectId, columns, projectTags, participants, canEdit, canMove, canComment, isAdmin, onChanged, onClose }: Props) {
  const { user } = useAuth();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? '');
  const [date, setDate] = useState(card.work_date ? card.work_date.slice(0, 10) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comments, setComments] = useState<CardComment[]>([]);
  const [files, setFiles] = useState<CardFile[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState<{ id: number; text: string } | null>(null);
  const [newFile, setNewFile] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [tab, setTab] = useState<'files' | 'comments'>('comments');
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#4a8fd6');
  const [editTag, setEditTag] = useState<{ id: number; name: string; color: string } | null>(null);

  const loadExtras = useCallback(async () => {
    try {
      const [c, f] = await Promise.all([api.kanban.comments(card.id), api.kanban.cardFiles(card.id)]);
      setComments(c);
      setFiles(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить комментарии');
    }
  }, [card.id]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target instanceof HTMLTextAreaElement) && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Если карточку удалили или она пропала с доски (например, у другого пользователя) — закрываем окно
  const column = columns.find((c) => c.column_id === card.kanban_column_id);

  const run = async (action: () => Promise<unknown>, reloadExtras = false) => {
    setBusy(true);
    setError('');
    try {
      await action();
      await onChanged();
      if (reloadExtras) await loadExtras();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Операция не выполнена');
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Введите название карточки');
    run(() =>
      api.kanban.updateCardDetails(card.id, {
        title: title.trim(),
        description: description.trim() || null,
        workDate: date ? `${date}T00:00:00.000Z` : null,
      }),
    );
  };

  const dirty =
    title !== card.title ||
    description !== (card.description ?? '') ||
    date !== (card.work_date ? card.work_date.slice(0, 10) : '');

  const assigned = new Set(card.participants.map((p) => p.participant_id));
  const tagged = new Set(card.tags.map((t) => t.id));

  const doDelete = () => {
    if (window.confirm(`Удалить карточку «${card.title}»?`)) {
      run(async () => {
        await api.kanban.deleteCard(card.id);
        onClose();
      });
    }
  };

  const resetForm = () => {
    setTitle(card.title);
    setDescription(card.description ?? '');
    setDate(card.work_date ? card.work_date.slice(0, 10) : '');
  };

  return (
    <aside className="cp" aria-label="Карточка">
      <header className="cp-head">
        <div className="cp-titles">
          <h2>Карточка</h2>
          {column && <p>Колонка «{column.column_title}»</p>}
        </div>
        <div className="cp-tools">
          {canEdit && (
            <button type="button" className="icon-btn cp-trash" disabled={busy} onClick={doDelete} aria-label="Удалить карточку" title="Удалить карточку">
              <Icon name="trash" size={18} />
            </button>
          )}
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть карточку" title="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </div>
      </header>
      <div className="cm-layout">
        <div className="cm-main">
          <form id="card-form" onSubmit={save} className="cm-top">
            <textarea
              className="cm-title"
              rows={1}
              value={title}
              maxLength={200}
              disabled={!canEdit}
              placeholder="Название карточки"
              aria-label="Название"
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
            />
            <label className="cm-label" htmlFor="cm-desc">
              Описание
            </label>
            <textarea
              id="cm-desc"
              className="cm-desc"
              rows={4}
              value={description}
              disabled={!canEdit}
              placeholder={canEdit ? 'Добавьте описание…' : 'Описания нет'}
              onChange={(e) => setDescription(e.target.value)}
            />
          </form>

          <section className="cm-bottom">
            <div className="cm-tabs" role="tablist">
              <button role="tab" aria-selected={tab === 'comments'} className={tab === 'comments' ? 'on' : ''} onClick={() => setTab('comments')}>
                Комментарии <b>{comments.length}</b>
              </button>
              <button role="tab" aria-selected={tab === 'files'} className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>
                Вложения <b>{files.length}</b>
              </button>
            </div>

            {tab === 'files' && (
              <div className="cm-pane">
                {files.length > 0 && (
                  <ul className="fitems">
                    {files.map((f) => (
                      <FileItem
                        key={f.id}
                        kind={f.kind === 'upload' ? 'file' : 'link'}
                        name={f.name}
                        href={f.url}
                        meta={f.kind === 'upload' ? `${formatSize(f.size)} · ${when(f.uploaded_at)}` : `Ссылка · ${when(f.uploaded_at)}`}
                        busy={busy}
                        onDownload={() => run(() => api.kanban.downloadCardFile(f.id, f.name))}
                        onDelete={canEdit ? () => window.confirm(`Удалить вложение «${f.name}»?`) && run(() => api.kanban.deleteFile(f.id), true) : undefined}
                      />
                    ))}
                  </ul>
                )}
                {files.length === 0 && !canEdit && <p className="muted">Нет вложений</p>}
                {canEdit && (
                  <>
                    <FileDrop
                      compact
                      disabled={busy}
                      onFiles={(picked) => {
                        if (picked.length === 0) return;
                        const big = picked.find(tooBig);
                        if (big) return setError(`Файл «${big.name}» больше ${MAX_UPLOAD_MB} МБ`);
                        run(async () => {
                          for (const file of picked) await api.kanban.uploadCardFile(card.id, file);
                        }, true);
                      }}
                    />
                    {showLink ? (
                      <form
                        className="inline-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const v = newFile.trim();
                          if (!v) return;
                          run(async () => {
                            await api.kanban.addCardLink(card.id, v);
                            setNewFile('');
                            setShowLink(false);
                          }, true);
                        }}
                      >
                        <input autoFocus value={newFile} maxLength={512} placeholder="https://…" onChange={(e) => setNewFile(e.target.value)} />
                        <button className="btn btn-primary" disabled={busy || !newFile.trim()}>
                          Добавить
                        </button>
                        <button type="button" className="btn btn-quiet" onClick={() => setShowLink(false)}>
                          Отмена
                        </button>
                      </form>
                    ) : (
                      <button type="button" className="link-btn storage-link-toggle" onClick={() => setShowLink(true)}>
                        + Добавить ссылку
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === 'comments' && (
              <div className="cm-pane">
                <ul className="comment-list">
                  {comments.map((c) => {
                    const mine = c.author_id === user?.id;
                    return (
                      <li key={c.id} className="comment">
                        <Avatar user={{ username: c.author_name ?? '?', avatar_url: c.author_avatar_url }} size={32} />
                        <div className="comment-main">
                          <div className="comment-head">
                            <strong>{c.author_name ?? 'Удалённый пользователь'}</strong>
                            <span className="muted">
                              {when(c.created_at)}
                              {c.updated_at ? ' · изменён' : ''}
                            </span>
                          </div>
                          {editingComment?.id === c.id ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!editingComment.text.trim()) return;
                                run(async () => {
                                  await api.kanban.updateComment(c.id, editingComment.text);
                                  setEditingComment(null);
                                }, true);
                              }}
                            >
                              <textarea rows={2} value={editingComment.text} onChange={(e) => setEditingComment({ id: c.id, text: e.target.value })} />
                              <div className="kadd-actions">
                                <button className="btn btn-primary" disabled={busy}>
                                  Сохранить
                                </button>
                                <button type="button" className="btn btn-quiet" onClick={() => setEditingComment(null)}>
                                  Отмена
                                </button>
                              </div>
                            </form>
                          ) : (
                            <p className="comment-text">{c.content}</p>
                          )}
                          {canComment && (mine || isAdmin) && editingComment?.id !== c.id && (
                            <span className="comment-actions">
                              {mine && (
                                <button type="button" className="link-btn" onClick={() => setEditingComment({ id: c.id, text: c.content })}>
                                  Изменить
                                </button>
                              )}
                              <button type="button" className="link-btn" disabled={busy} onClick={() => run(() => api.kanban.deleteComment(c.id), true)}>
                                Удалить
                              </button>
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                  {comments.length === 0 && <li className="cm-empty">Комментариев пока нет</li>}
                </ul>
                {canComment && (
                  <form
                    className="cm-compose"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = newComment.trim();
                      if (!v) return;
                      run(async () => {
                        await api.kanban.addComment(card.id, v);
                        setNewComment('');
                      }, true);
                    }}
                  >
                    <textarea rows={2} value={newComment} placeholder="Написать комментарий…" onChange={(e) => setNewComment(e.target.value)} />
                    <button className="btn btn-primary" disabled={busy || !newComment.trim()}>
                      Отправить
                    </button>
                  </form>
                )}
              </div>
            )}
          </section>

          {(dirty || error) && (
            <div className="cm-savebar">
              {error ? <span className="cm-err">{error}</span> : <span className="muted">Есть несохранённые изменения</span>}
              {dirty && (
                <>
                  <button type="button" className="btn btn-quiet" onClick={resetForm}>
                    Отменить
                  </button>
                  <button className="btn btn-primary" form="card-form" disabled={busy}>
                    Сохранить
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="cm-side">
          <div className="cm-prop">
            <span className="cm-label">Статус</span>
            <button
              type="button"
              className={`cm-done${card.status_id === 1 ? ' on' : ''}`}
              disabled={!canEdit || busy}
              onClick={() => run(() => api.kanban.updateCardStatus(card.id, card.status_id === 1 ? 0 : 1))}
            >
              <Icon name="check" size={16} />
              {card.status_id === 1 ? 'Выполнена' : 'Отметить выполненной'}
            </button>
          </div>

          <div className="cm-prop">
            <label className="cm-label" htmlFor="cm-col">
              Колонка
            </label>
            <select
              id="cm-col"
              value={card.kanban_column_id}
              disabled={!canMove || busy}
              onChange={(e) => run(() => api.kanban.moveCard(card.id, Number(e.target.value)))}
            >
              {columns.map((c) => (
                <option key={c.column_id} value={c.column_id}>
                  {c.column_title}
                </option>
              ))}
            </select>
          </div>

          <div className="cm-prop">
            <label className="cm-label" htmlFor="cm-date">
              Срок
            </label>
            <input id="cm-date" type="date" value={date} disabled={!canEdit} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="cm-prop">
            <span className="cm-label">Теги</span>
            <div className="chips">
              {card.tags.map((t) => (
                <span key={t.id} className="fchip on-static">
                  <i className="dot" style={{ background: t.color_code }} />
                  {t.name}
                  {canEdit && (
                    <button type="button" className="chip-x" aria-label={`Убрать тег ${t.name}`} disabled={busy} onClick={() => run(() => api.kanban.removeCardTag(card.id, t.id))}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              {canEdit && (
                <Dropdown buttonClassName="add-chip" ariaLabel="Добавить тег" title="Добавить тег" disabled={busy} button={<Icon name="plus" size={14} />}>
                  <div className="pick-list">
                    {projectTags.length === 0 && <p className="muted hint">Тегов Канбана в проекте пока нет — создайте первый:</p>}
                    {projectTags.map((t) =>
                      editTag?.id === t.id ? (
                        <form
                          key={t.id}
                          className="tag-edit"
                          onSubmit={(e) => {
                            e.preventDefault();
                            const name = editTag.name.trim();
                            if (!name) return;
                            run(async () => {
                              await api.kanbanTags.update(t.id, { name, colorCode: editTag.color });
                              setEditTag(null);
                            });
                          }}
                        >
                          <input type="color" value={editTag.color} aria-label="Цвет тега" onChange={(e) => setEditTag({ ...editTag, color: e.target.value })} />
                          <input autoFocus value={editTag.name} maxLength={50} aria-label="Название тега" onChange={(e) => setEditTag({ ...editTag, name: e.target.value })} />
                          <button className="icon-btn" aria-label="Сохранить тег" title="Сохранить" disabled={busy || !editTag.name.trim()}>
                            <Icon name="check" size={16} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label="Удалить тег"
                            title="Удалить тег из проекта"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm(`Удалить тег «${t.name}» из проекта? Он пропадёт со всех карточек.`)) {
                                run(async () => {
                                  await api.kanbanTags.remove(t.id);
                                  setEditTag(null);
                                });
                              }
                            }}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </form>
                      ) : (
                        <div key={t.id} className="pick-row">
                          <button
                            type="button"
                            className="pick-item"
                            onClick={() => run(() => (tagged.has(t.id) ? api.kanban.removeCardTag(card.id, t.id) : api.kanban.addCardTag(card.id, t.id)))}
                          >
                            <i className="dot" style={{ background: t.color_code }} />
                            <span>{t.name}</span>
                            {tagged.has(t.id) && <Icon name="check" size={16} />}
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            aria-label={`Изменить тег ${t.name}`}
                            title="Изменить тег"
                            onClick={() => setEditTag({ id: t.id, name: t.name, color: t.color_code || '#4a8fd6' })}
                          >
                            <Icon name="edit" size={16} />
                          </button>
                        </div>
                      ),
                    )}
                    <form
                      className="tag-create"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const name = newTagName.trim();
                        if (!name) return;
                        run(async () => {
                          const tag = await api.kanbanTags.create(projectId, name, newTagColor);
                          await api.kanban.addCardTag(card.id, tag.id);
                          setNewTagName('');
                        });
                      }}
                    >
                      <input type="color" value={newTagColor} aria-label="Цвет тега" onChange={(e) => setNewTagColor(e.target.value)} />
                      <input value={newTagName} maxLength={50} placeholder="Новый тег" onChange={(e) => setNewTagName(e.target.value)} />
                      <button className="btn btn-secondary" disabled={busy || !newTagName.trim()}>
                        +
                      </button>
                    </form>
                  </div>
                </Dropdown>
              )}
              {!canEdit && card.tags.length === 0 && <span className="muted">—</span>}
            </div>
          </div>

          <div className="cm-prop">
            <span className="cm-label">Исполнители</span>
            <div className="chips">
              {card.participants.map((p) => (
                <span key={p.participant_id} className="fchip on-static">
                  <Avatar user={p} size={18} />
                  {p.username}
                  {canEdit && (
                    <button type="button" className="chip-x" aria-label={`Снять ${p.username}`} disabled={busy} onClick={() => run(() => api.kanban.removeCardParticipant(card.id, p.participant_id))}>
                      ×
                    </button>
                  )}
                </span>
              ))}
              {canEdit && (
                <Dropdown buttonClassName="add-chip" ariaLabel="Назначить исполнителя" title="Назначить исполнителя" disabled={busy} button={<Icon name="plus" size={14} />}>
                  <div className="pick-list">
                    {participants.map((m) => (
                      <button
                        key={m.participant_id}
                        type="button"
                        className="pick-item"
                        onClick={() =>
                          run(() =>
                            assigned.has(m.participant_id)
                              ? api.kanban.removeCardParticipant(card.id, m.participant_id)
                              : api.kanban.addCardParticipant(card.id, m.participant_id),
                          )
                        }
                      >
                        <Avatar user={m} size={20} />
                        <span>{m.username}</span>
                        {assigned.has(m.participant_id) && <Icon name="check" size={16} />}
                      </button>
                    ))}
                  </div>
                </Dropdown>
              )}
              {!canEdit && card.participants.length === 0 && <span className="muted">—</span>}
            </div>
          </div>
        </aside>
      </div>
    </aside>
  );
}
