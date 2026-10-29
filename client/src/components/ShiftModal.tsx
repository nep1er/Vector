import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ShiftItem, ShiftPlan, ShiftRecord } from '../types';
import Modal from './Modal';

interface Props {
  projectId: number;
  roadmapId: number;
  roadmapTitle: string;
  canManage: boolean;
  onClose: () => void;
  /** Вызывается после смещения/отмены — страница перезагружает дерево задач */
  onChanged: () => void | Promise<void>;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ru-RU') : '—');
const dt = (iso: string) => new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
const range = (a: string | null, b: string | null) => (a && b && a !== b ? `${d(a)} – ${d(b)}` : d(a ?? b));
const daysWord = (n: number) => {
  const m = Math.abs(n) % 100;
  const l = m % 10;
  return m > 10 && m < 15 ? 'дней' : l === 1 ? 'день' : l >= 2 && l <= 4 ? 'дня' : 'дней';
};
const signed = (n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)} ${daysWord(n)}`;

/** «Смещение сроков»: перенос всех задач уровня RoadMap с выбранной даты + история смещений. */
export default function ShiftModal({ projectId, roadmapId, roadmapTitle, canManage, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<'new' | 'history'>(canManage ? 'new' : 'history');
  const [fromDate, setFromDate] = useState(today());
  const [amount, setAmount] = useState('7');
  const [dir, setDir] = useState<1 | -1>(1);
  const [comment, setComment] = useState('');
  const [plan, setPlan] = useState<ShiftPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ShiftRecord[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [items, setItems] = useState<Record<number, ShiftItem[]>>({});
  const [info, setInfo] = useState('');

  const days = Number(amount) * dir;
  const valid = !!fromDate && Number.isInteger(Number(amount)) && Number(amount) > 0 && Number(amount) <= 3650;

  const loadHistory = () => api.shifts.history(projectId).then(setHistory).catch((e) => setError(e.message));
  useEffect(() => {
    loadHistory();
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // живой предпросмотр с небольшой задержкой
  useEffect(() => {
    if (tab !== 'new' || !valid) {
      setPlan(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api.shifts
        .preview(projectId, { roadmapId, fromDate, days })
        .then((p) => !cancelled && (setPlan(p), setError('')))
        .catch((e) => !cancelled && (setPlan(null), setError(e.message)));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tab, valid, fromDate, days, projectId, roadmapId]);

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const rec = await api.shifts.apply(projectId, { roadmapId, fromDate, days, comment });
      await onChanged();
      setComment('');
      setInfo(`Готово: перенесено задач — ${rec.tasks_count}`);
      await loadHistory();
      setTab('history');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: number) => {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (!items[id]) {
      try {
        const r = await api.shifts.details(id);
        setItems((m) => ({ ...m, [id]: r.items }));
      } catch (e: any) {
        setError(e.message);
      }
    }
  };

  const undo = async (s: ShiftRecord) => {
    if (!window.confirm('Вернуть прежние сроки? Задачи, которые с тех пор двигали вручную, не изменятся.')) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.shifts.undo(s.id);
      await onChanged();
      await loadHistory();
      setInfo(`Отменено: возвращено ${r.restored}` + (r.skipped ? `, пропущено (менялись вручную) ${r.skipped}` : ''));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Смещение сроков" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        {canManage && (
          <button role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'tab active' : 'tab'} onClick={() => setTab('new')}>
            Сместить
          </button>
        )}
        <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'tab active' : 'tab'} onClick={() => setTab('history')}>
          История{history.length ? ` (${history.length})` : ''}
        </button>
      </div>

      <div className="tab-body shift-body">
        {error && <div className="notice notice-err">{error}</div>}
        {info && <div className="notice">{info}</div>}

        {tab === 'new' && (
          <>
            <p className="hint">
              Все задачи уровня «{roadmapTitle}», которые заканчиваются в выбранную дату или позже, переносятся целиком — с
              сохранением длительности и вложенных задач. Выполненные задачи и задачи без дат остаются на месте.
            </p>
            <div className="shift-form">
              <label className="field">
                <span>С какой даты</span>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              <label className="field">
                <span>На сколько дней</span>
                <input type="number" min={1} max={3650} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </label>
              <div className="field">
                <span>Направление</span>
                <div className="shift-dir">
                  <button type="button" className={dir === 1 ? 'chip-btn selected' : 'chip-btn'} onClick={() => setDir(1)}>
                    Позже
                  </button>
                  <button type="button" className={dir === -1 ? 'chip-btn selected' : 'chip-btn'} onClick={() => setDir(-1)}>
                    Раньше
                  </button>
                </div>
              </div>
            </div>
            <div className="shift-quick">
              {[7, 14, 30].map((n) => (
                <button key={n} type="button" className={Number(amount) === n ? 'chip-btn selected' : 'chip-btn'} onClick={() => setAmount(String(n))}>
                  {n} {daysWord(n)}
                </button>
              ))}
              <button type="button" className="chip-btn" onClick={() => setFromDate(today())}>
                С сегодняшнего дня
              </button>
            </div>

            <label className="field">
              <span>Комментарий (необязательно)</span>
              <input value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} placeholder="Например: сдвиг после срыва релиза" />
            </label>

            <div className="shift-preview">
              {!valid ? (
                <p className="muted">Укажите дату и число дней от 1 до 3650.</p>
              ) : !plan ? (
                <p className="muted">Считаю…</p>
              ) : plan.items.length === 0 ? (
                <p className="muted">С этой даты нет задач для переноса.</p>
              ) : (
                <>
                  <p>
                    Будет перенесено задач: <b>{plan.items.length}</b> ({signed(days)})
                  </p>
                  <ul className="shift-list">
                    {plan.items.map((i) => (
                      <li key={i.id}>
                        <span className="shift-title">{i.title}</span>
                        <span className="muted">
                          {range(i.old_start, i.old_end)} → <b>{range(i.new_start, i.new_end)}</b>
                        </span>
                      </li>
                    ))}
                    {plan.containers.map((c) => (
                      <li key={`c${c.id}`} className="shift-container">
                        <span className="shift-title">Границы «{c.title}» будут расширены</span>
                        <span className="muted">
                          {range(c.old_start, c.old_end)} → <b>{range(c.new_start, c.new_end)}</b>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="modal-actions">
              <button className="btn btn-quiet" onClick={onClose}>
                Закрыть
              </button>
              <button className="btn btn-primary" disabled={busy || !plan || plan.items.length === 0} onClick={apply}>
                {plan && plan.items.length ? `Сместить ${plan.items.length} ${plan.items.length === 1 ? 'задачу' : 'задач'}` : 'Сместить'}
              </button>
            </div>
          </>
        )}

        {tab === 'history' && (
          <>
            {history.length === 0 && <p className="muted">Смещений пока не было.</p>}
            <ul className="shift-history">
              {history.map((s) => (
                <li key={s.id} className={s.reverted_at ? 'shift-rec reverted' : 'shift-rec'}>
                  <button className="shift-rec-head" onClick={() => toggle(s.id)} aria-expanded={open === s.id}>
                    <span className="shift-days">{signed(s.shift_days)}</span>
                    <span className="shift-main">
                      <b>с {d(s.from_date)}</b> · задач: {s.tasks_count} · «{s.roadmap_title}»
                      <span className="muted">
                        {' '}
                        {s.created_by_name ?? 'неизвестно'}, {dt(s.created_at)}
                      </span>
                    </span>
                    {s.reverted_at && <span className="chip">Отменено</span>}
                  </button>
                  {s.comment && <p className="shift-comment">{s.comment}</p>}
                  {open === s.id && (
                    <div className="shift-detail">
                      {!items[s.id] ? (
                        <p className="muted">Загрузка…</p>
                      ) : (
                        <ul className="shift-list">
                          {items[s.id].map((i) => (
                            <li key={i.id} className={i.is_container ? 'shift-container' : ''}>
                              <span className="shift-title">{i.is_container ? `Границы «${i.task_title}»` : i.task_title}</span>
                              <span className="muted">
                                {range(i.old_start, i.old_end)} → <b>{range(i.new_start, i.new_end)}</b>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {s.reverted_at && (
                        <p className="muted">
                          Отменил {s.reverted_by_name ?? 'неизвестно'}, {dt(s.reverted_at)}
                        </p>
                      )}
                      {canManage && !s.reverted_at && (
                        <button className="btn btn-danger-ghost" disabled={busy} onClick={() => undo(s)}>
                          Отменить смещение
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {tab === 'history' && (
              <div className="modal-actions">
                <button className="btn btn-quiet" onClick={onClose}>
                  Закрыть
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
