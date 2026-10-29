import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import type { CardComment, CardFile, KanbanCard, KanbanColumn, KanbanTag, Participant } from '../types';
import Avatar from './Avatar';
import Dropdown from './Dropdown';
import Icon from './Icon';
import Modal from './Modal';
import { MAX_UPLOAD_MB, formatSize, tooBig } from '../utils/format';

interface Props {
  card: KanbanCard;
  projectId: number;
  columns: KanbanColumn[];
  projectTags: KanbanTag[];
  participants: Participant[];
  canEdit: boolean;
  /** Admin может удалять чужие комментарии */
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  onClose: () => void;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Окно карточки: все поля, теги, исполнители, перенос в другую колонку, файлы и комментарии. */
export default function CardModal({ card, projectId, columns, projectTags, participants, canEdit, isAdmin, onChanged, onClose }: Props) {
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
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#4a8fd6');

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

  return (
    <Modal title="Карточка" onClose={onClose} wide>
      <form onSubmit={save} className="card-form">
        <label className="field">
          <span>Название</span>
          <input value={title} maxLength={200} disabled={!canEdit} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <div className="card-grid">
          <label className="field">
            <span>Колонка</span>
            <select
              value={card.kanban_column_id}
              disabled={!canEdit || busy}
              onChange={(e) => run(() => api.kanban.moveCard(card.id, Number(e.target.value)))}
            >
              {columns.map((c) => (
                <option key={c.column_id} value={c.column_id}>
                  {c.column_title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Срок</span>
            <input type="date" value={date} disabled={!canEdit} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field field-check">
            <input
              type="checkbox"
              checked={card.status_id === 1}
              disabled={!canEdit || busy}
              onChange={() => run(() => api.kanban.updateCardStatus(card.id, card.status_id === 1 ? 0 : 1))}
            />
            <span>Выполнена</span>
          </label>
        </div>

        <label className="field">
          <span>Описание</span>
          <textarea rows={4} value={description} disabled={!canEdit} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="field">
          <span>Теги</span>
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
                  {projectTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="pick-item"
                      onClick={() => run(() => (tagged.has(t.id) ? api.kanban.removeCardTag(card.id, t.id) : api.kanban.addCardTag(card.id, t.id)))}
                    >
                      <i className="dot" style={{ background: t.color_code }} />
                      <span>{t.name}</span>
                      {tagged.has(t.id) && <Icon name="check" size={16} />}
                    </button>
                  ))}
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

        <div className="field">
          <span>Исполнители</span>
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

        {error && <div className="notice notice-err">{error}</div>}

        {canEdit && (
          <div className="modal-actions card-actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`Удалить карточку «${card.title}»?`)) {
                  run(async () => {
                    await api.kanban.deleteCard(card.id);
                    onClose();
                  });
                }
              }}
            >
              Удалить
            </button>
            <button className="btn btn-primary" disabled={busy || !dirty}>
              Сохранить
            </button>
          </div>
        )}
      </form>

      <h3 className="section-title">Вложения ({files.length})</h3>
      <ul className="list">
        {files.map((f) => (
          <li key={f.id} className="list-row">
            <div className="list-main">
              {f.kind === 'link' ? (
                <a href={f.url ?? '#'} target="_blank" rel="noreferrer noopener">
                  {f.name}
                </a>
              ) : f.kind === 'upload' ? (
                <button type="button" className="link-btn" onClick={() => run(() => api.kanban.downloadCardFile(f.id, f.name))}>
                  {f.name}
                </button>
              ) : (
                <span>{f.name}</span>
              )}
              <span className="muted">
                {f.kind === 'upload' ? formatSize(f.size) : f.kind === 'link' ? 'ссылка' : ''}
              </span>
            </div>
            {canEdit && (
              <button className="icon-btn" aria-label={`Удалить вложение ${f.name}`} disabled={busy} onClick={() => run(() => api.kanban.deleteFile(f.id), true)}>
                <Icon name="trash" size={16} />
              </button>
            )}
          </li>
        ))}
        {files.length === 0 && <li className="muted">Нет вложений</li>}
      </ul>
      {canEdit && (
        <div className="attach-bar">
          <label className="btn btn-secondary attach-pick">
            Прикрепить файлы
            <input
              type="file"
              multiple
              hidden
              disabled={busy}
              onChange={(e) => {
                const picked = [...(e.target.files ?? [])];
                e.target.value = '';
                if (picked.length === 0) return;
                const big = picked.find(tooBig);
                if (big) return setError(`Файл «${big.name}» больше ${MAX_UPLOAD_MB} МБ`);
                run(async () => {
                  for (const file of picked) await api.kanban.uploadCardFile(card.id, file);
                }, true);
              }}
            />
          </label>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const v = newFile.trim();
              if (!v) return;
              run(async () => {
                await api.kanban.addCardLink(card.id, v);
                setNewFile('');
              }, true);
            }}
          >
            <input value={newFile} maxLength={512} placeholder="…или ссылка (https://…)" onChange={(e) => setNewFile(e.target.value)} />
            <button className="btn btn-secondary" disabled={busy || !newFile.trim()}>
              Добавить
            </button>
          </form>
        </div>
      )}

      <h3 className="section-title">Комментарии ({comments.length})</h3>
      <ul className="comment-list">
        {comments.map((c) => {
          const mine = c.author_id === user?.id;
          return (
            <li key={c.id} className="comment">
              <Avatar user={{ username: c.author_name ?? '?', avatar_url: c.author_avatar_url }} size={28} />
              <div className="comment-main">
                <div className="comment-head">
                  <strong>{c.author_name ?? 'Удалённый пользователь'}</strong>
                  <span className="muted">
                    {when(c.created_at)}
                    {c.updated_at ? ' · изменён' : ''}
                  </span>
                  {canEdit && (mine || isAdmin) && (
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
              </div>
            </li>
          );
        })}
        {comments.length === 0 && <li className="muted">Комментариев пока нет</li>}
      </ul>
      {canEdit && (
        <form
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
          <div className="kadd-actions">
            <button className="btn btn-secondary" disabled={busy || !newComment.trim()}>
              Отправить
            </button>
          </div>
        </form>
      )}

      <div className="modal-actions">
        <span className="muted card-where">{column ? `В колонке «${column.column_title}»` : ''}</span>
        <button className="btn btn-secondary" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </Modal>
  );
}
