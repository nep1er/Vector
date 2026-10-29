import { useEffect, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { api } from '../api';
import type { KanbanCard, KanbanColumn } from '../types';
import Avatar from './Avatar';
import Icon from './Icon';
import Modal from './Modal';

interface Props {
  todoId: number;
  columns: KanbanColumn[];
  canEdit: boolean;
  /** Сразу открыть форму новой колонки */
  startAddingColumn?: boolean;
  /** Перезагрузить доску с сервера (после любого изменения) */
  onReload: () => Promise<void>;
  onOpenCard: (card: KanbanCard) => void;
  onError: (message: string) => void;
}

type Drag = { type: 'card'; id: number; from: number } | { type: 'column'; id: number } | null;

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const isOverdue = (c: KanbanCard) => c.status_id !== 1 && !!c.work_date && new Date(c.work_date).getTime() < Date.now() - 86_400_000;

/**
 * Канбан-доска: колонки слева направо, карточки сверху вниз.
 * Карточки и колонки перетаскиваются мышью (HTML5 drag&drop); у колонок есть и кнопки «влево/вправо».
 */
export default function KanbanBoard({ todoId, columns, canEdit, startAddingColumn = false, onReload, onOpenCard, onError }: Props) {
  const [cols, setCols] = useState<KanbanColumn[]>(columns);
  const drag = useRef<Drag>(null);
  const [drop, setDrop] = useState<{ colId: number; index: number } | null>(null);
  const [colDrop, setColDrop] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [addingColumn, setAddingColumn] = useState(startAddingColumn);
  const [editingColumn, setEditingColumn] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<KanbanColumn | null>(null);

  useEffect(() => setCols(columns), [columns]);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Операция не выполнена');
    } finally {
      await onReload();
    }
  };

  // ---------- перетаскивание карточек ----------
  const dropIndexAt = (e: DragEvent, colEl: HTMLElement, draggedId: number) => {
    const cards = [...colEl.querySelectorAll<HTMLElement>('[data-card-id]')].filter(
      (el) => Number(el.dataset.cardId) !== draggedId,
    );
    let index = 0;
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      if (e.clientY > r.top + r.height / 2) index++;
    }
    return index;
  };

  const onCardDragOver = (e: DragEvent<HTMLElement>, col: KanbanColumn) => {
    const d = drag.current;
    if (!d || d.type !== 'card') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const index = dropIndexAt(e, e.currentTarget, d.id);
    if (drop?.colId !== col.column_id || drop.index !== index) setDrop({ colId: col.column_id, index });
  };

  const onCardDrop = (e: DragEvent<HTMLElement>, col: KanbanColumn) => {
    const d = drag.current;
    if (!d || d.type !== 'card') return;
    e.preventDefault();
    const index = dropIndexAt(e, e.currentTarget, d.id);
    drag.current = null;
    setDrop(null);
    // сразу показываем результат, не дожидаясь сервера
    setCols((prev) => {
      let moved: KanbanCard | undefined;
      const without = prev.map((c) => ({
        ...c,
        cards: c.cards.filter((x) => (x.id === d.id ? ((moved = x), false) : true)),
      }));
      if (!moved) return prev;
      return without.map((c) =>
        c.column_id === col.column_id
          ? { ...c, cards: [...c.cards.slice(0, index), { ...moved!, kanban_column_id: col.column_id }, ...c.cards.slice(index)] }
          : c,
      );
    });
    run(() => api.kanban.moveCard(d.id, col.column_id, index));
  };

  // ---------- перетаскивание колонок ----------
  const colIndexAt = (e: DragEvent, board: HTMLElement, draggedId: number) => {
    const els = [...board.querySelectorAll<HTMLElement>('[data-col-id]')].filter((el) => Number(el.dataset.colId) !== draggedId);
    let index = 0;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (e.clientX > r.left + r.width / 2) index++;
    }
    return index;
  };

  const onBoardDragOver = (e: DragEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.type !== 'column') return;
    e.preventDefault();
    setColDrop(colIndexAt(e, e.currentTarget, d.id));
  };

  const onBoardDrop = (e: DragEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.type !== 'column') return;
    e.preventDefault();
    const index = colIndexAt(e, e.currentTarget, d.id);
    drag.current = null;
    setColDrop(null);
    setCols((prev) => {
      const moved = prev.find((c) => c.column_id === d.id);
      if (!moved) return prev;
      const rest = prev.filter((c) => c.column_id !== d.id);
      return [...rest.slice(0, index), moved, ...rest.slice(index)];
    });
    run(() => api.kanban.updateColumn(d.id, { position: index + 1 }));
  };

  const endDrag = () => {
    drag.current = null;
    setDrop(null);
    setColDrop(null);
  };

  const moveColumn = (col: KanbanColumn, delta: number) => {
    const i = cols.findIndex((c) => c.column_id === col.column_id);
    const target = i + delta;
    if (target < 0 || target >= cols.length) return;
    run(() => api.kanban.updateColumn(col.column_id, { position: target + 1 }));
  };

  // ---------- создание ----------
  const addCard = (col: KanbanColumn, title: string) =>
    run(async () => {
      await api.kanban.createCard({ columnId: col.column_id, title });
    });

  const addColumn = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('title') as HTMLInputElement;
    const title = input.value.trim();
    if (!title) return;
    input.value = '';
    run(() => api.kanban.createColumn(todoId, title));
  };

  const toggleDone = (card: KanbanCard) => run(() => api.kanban.updateCardStatus(card.id, card.status_id === 1 ? 0 : 1));

  return (
    <div className="kboard" onDragOver={onBoardDragOver} onDrop={onBoardDrop}>
      {cols.map((col, ci) => (
        <section
          key={col.column_id}
          data-col-id={col.column_id}
          className={`kcol${colDrop === ci ? ' kcol-drop-before' : ''}${colDrop === cols.length && ci === cols.length - 1 ? ' kcol-drop-after' : ''}`}
          aria-label={`Колонка ${col.column_title}`}
        >
          <header
            className="kcol-head"
            draggable={canEdit && editingColumn !== col.column_id}
            onDragStart={(e) => {
              drag.current = { type: 'column', id: col.column_id };
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', `col-${col.column_id}`);
            }}
            onDragEnd={endDrag}
          >
            {editingColumn === col.column_id ? (
              <input
                className="kcol-title-input"
                autoFocus
                defaultValue={col.column_title}
                maxLength={100}
                aria-label="Название колонки"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  setEditingColumn(null);
                  if (v && v !== col.column_title) run(() => api.kanban.updateColumn(col.column_id, { title: v }));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') {
                    (e.target as HTMLInputElement).value = col.column_title;
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <h3
                className="kcol-title"
                title={canEdit ? 'Нажмите, чтобы переименовать' : undefined}
                onClick={() => canEdit && setEditingColumn(col.column_id)}
              >
                {col.column_title}
              </h3>
            )}
            <span className="kcol-count">{col.cards.length}</span>
            {canEdit && (
              <span className="kcol-actions">
                <button className="icon-btn" aria-label="Сдвинуть колонку влево" title="Влево" disabled={ci === 0} onClick={() => moveColumn(col, -1)}>
                  ‹
                </button>
                <button
                  className="icon-btn"
                  aria-label="Сдвинуть колонку вправо"
                  title="Вправо"
                  disabled={ci === cols.length - 1}
                  onClick={() => moveColumn(col, 1)}
                >
                  ›
                </button>
                <button className="icon-btn" aria-label={`Удалить колонку ${col.column_title}`} title="Удалить колонку" onClick={() => setDeleting(col)}>
                  <Icon name="trash" size={16} />
                </button>
              </span>
            )}
          </header>

          <div
            className={`kcol-body${drop?.colId === col.column_id ? ' kcol-body-over' : ''}`}
            onDragOver={(e) => onCardDragOver(e, col)}
            onDrop={(e) => onCardDrop(e, col)}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrop((d) => (d?.colId === col.column_id ? null : d));
            }}
          >
            {col.cards.map((card, i) => (
              <div key={card.id} className="kslot">
                {drop?.colId === col.column_id && drop.index === i && <div className="kdrop-line" />}
                <article
                  data-card-id={card.id}
                  className={`kcard${card.status_id === 1 ? ' kcard-done' : ''}`}
                  draggable={canEdit}
                  tabIndex={0}
                  onDragStart={(e) => {
                    drag.current = { type: 'card', id: card.id, from: col.column_id };
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', `card-${card.id}`);
                  }}
                  onDragEnd={endDrag}
                  onClick={() => onOpenCard(card)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpenCard(card)}
                >
                  {card.tags.length > 0 && (
                    <div className="kcard-tags">
                      {card.tags.map((t) => (
                        <span key={t.id} className="kcard-tag" style={{ background: t.color_code }} title={t.name} />
                      ))}
                    </div>
                  )}
                  <div className="kcard-title-row">
                    {canEdit && (
                      <input
                        type="checkbox"
                        className="kcard-check"
                        checked={card.status_id === 1}
                        aria-label="Выполнена"
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => toggleDone(card)}
                      />
                    )}
                    <span className="kcard-title">{card.title}</span>
                  </div>
                  <div className="kcard-meta">
                    {card.work_date && (
                      <span className={isOverdue(card) ? 'kmeta kmeta-late' : 'kmeta'} title="Срок">
                        {dateFmt.format(new Date(card.work_date))}
                      </span>
                    )}
                    {card.description && <span className="kmeta" title="Есть описание">≡</span>}
                    {card.comments_count > 0 && <span className="kmeta" title="Комментарии">💬 {card.comments_count}</span>}
                    {card.files_count > 0 && <span className="kmeta" title="Вложения">📎 {card.files_count}</span>}
                    <span className="kcard-people">
                      {card.participants.slice(0, 3).map((p) => (
                        <span key={p.participant_id} title={p.username}>
                          <Avatar user={p} size={22} />
                        </span>
                      ))}
                      {card.participants.length > 3 && <span className="kmeta">+{card.participants.length - 3}</span>}
                    </span>
                  </div>
                </article>
              </div>
            ))}
            {drop?.colId === col.column_id && drop.index >= col.cards.length && <div className="kdrop-line" />}
            {col.cards.length === 0 && !drop && <p className="kcol-empty">Нет карточек</p>}
          </div>

          {canEdit &&
            (adding === col.column_id ? (
              <form
                className="kadd-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const ta = e.currentTarget.elements.namedItem('title') as HTMLTextAreaElement;
                  const v = ta.value.trim();
                  if (!v) return;
                  ta.value = '';
                  addCard(col, v);
                }}
              >
                <textarea
                  name="title"
                  autoFocus
                  rows={2}
                  maxLength={200}
                  placeholder="Название карточки"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                    if (e.key === 'Escape') setAdding(null);
                  }}
                />
                <div className="kadd-actions">
                  <button className="btn btn-primary">Добавить</button>
                  <button type="button" className="btn btn-quiet" onClick={() => setAdding(null)}>
                    Готово
                  </button>
                </div>
              </form>
            ) : (
              <button className="kadd-btn" onClick={() => setAdding(col.column_id)}>
                <Icon name="plus" size={16} /> Добавить карточку
              </button>
            ))}
        </section>
      ))}

      {colDrop === cols.length && <div className="kcol-drop-end" />}

      {canEdit && (
        <div className="kcol kcol-new">
          {addingColumn ? (
            <form onSubmit={addColumn}>
              <input
                name="title"
                autoFocus
                maxLength={100}
                placeholder="Название колонки"
                onKeyDown={(e) => e.key === 'Escape' && setAddingColumn(false)}
              />
              <div className="kadd-actions">
                <button className="btn btn-primary">Добавить</button>
                <button type="button" className="btn btn-quiet" onClick={() => setAddingColumn(false)}>
                  Готово
                </button>
              </div>
            </form>
          ) : (
            <button className="kadd-btn" onClick={() => setAddingColumn(true)}>
              <Icon name="plus" size={16} /> Добавить колонку
            </button>
          )}
        </div>
      )}

      {deleting && (
        <DeleteColumnModal
          column={deleting}
          others={cols.filter((c) => c.column_id !== deleting.column_id)}
          onClose={() => setDeleting(null)}
          onConfirm={(opts) => {
            const id = deleting.column_id;
            setDeleting(null);
            run(() => api.kanban.deleteColumn(id, opts));
          }}
        />
      )}
    </div>
  );
}

function DeleteColumnModal({
  column,
  others,
  onClose,
  onConfirm,
}: {
  column: KanbanColumn;
  others: KanbanColumn[];
  onClose: () => void;
  onConfirm: (opts: { moveTo?: number; withCards?: boolean }) => void;
}) {
  const has = column.cards.length > 0;
  // 'delete' — удалить вместе с карточками, иначе id колонки, куда перенести
  const [choice, setChoice] = useState<string>(others[0] ? String(others[0].column_id) : 'delete');

  return (
    <Modal title={`Удалить колонку «${column.column_title}»?`} onClose={onClose}>
      {has ? (
        <>
          <p>В колонке карточек: {column.cards.length}. Что с ними сделать?</p>
          <label className="field">
            <span>Карточки</span>
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              {others.map((c) => (
                <option key={c.column_id} value={c.column_id}>
                  Перенести в «{c.column_title}»
                </option>
              ))}
              <option value="delete">Удалить вместе с колонкой</option>
            </select>
          </label>
        </>
      ) : (
        <p>Колонка пуста — её можно удалить без последствий.</p>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Отмена
        </button>
        <button
          className="btn btn-danger"
          onClick={() => onConfirm(!has ? {} : choice === 'delete' ? { withCards: true } : { moveTo: Number(choice) })}
        >
          Удалить
        </button>
      </div>
    </Modal>
  );
}
