import type { PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskNode } from '../types';
import { DAY, dayIndex, dayOfMonth, formatDay, monthLabel, nextMonthStart, todayIndex } from '../utils/dates';
import { statusById, textOn } from '../utils/status';
import Icon from './Icon';

const ZOOMS = [4, 7, 12, 20, 32, 48, 72]; // пикселей на день
const DEFAULT_ZOOM = ZOOMS[ZOOMS.length - 2]; // по умолчанию — предпоследнее приближение: виден каждый день
const LANE_H = 56;
const LANE_GAP = 8;

interface Props {
  tasks: TaskNode[];
  /** Границы текущего этапа (если заданы) */
  range: { start: string | null; end: string | null };
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onOpen: (task: TaskNode) => void;
  /** Можно ли тянуть и растягивать дорожки мышью (право руководителя) */
  canEdit?: boolean;
  /** Новые даты после перетаскивания (ISO). Бросает ошибку, если сервер отказал. */
  onChangeDates?: (task: TaskNode, startIso: string, endIso: string) => Promise<void>;
}

interface DragState {
  id: number;
  mode: 'move' | 'l' | 'r';
  ds: number; // сдвиг начала в днях
  de: number; // сдвиг конца в днях
}

/** Дорожки на временной шкале: задачи — «клипы», пересекающиеся по времени ложатся на разные дорожки. */
export default function Timeline({ tasks, range, selectedId, onSelect, onOpen, canEdit, onChangeDates }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const suppressClick = useRef(false);

  const dated = useMemo(() => tasks.filter((t) => t.start_date && t.end_date), [tasks]);
  const undated = useMemo(() => tasks.filter((t) => !t.start_date || !t.end_date), [tasks]);
  const today = todayIndex();

  // Видимый диапазон дней
  const { startDay, endDay } = useMemo(() => {
    let s: number;
    let e: number;
    if (range.start && range.end) {
      s = dayIndex(range.start);
      e = dayIndex(range.end);
    } else if (dated.length) {
      s = Math.min(...dated.map((t) => dayIndex(t.start_date!)));
      e = Math.max(...dated.map((t) => dayIndex(t.end_date!)));
    } else {
      s = today - 3;
      e = today + 27;
    }
    const pad = Math.max(3, Math.round((e - s) * 0.05));
    s -= pad;
    e += pad;
    if (e - s < 30) {
      const extra = 30 - (e - s);
      s -= Math.floor(extra / 2);
      e += Math.ceil(extra / 2);
    }
    return { startDay: s, endDay: e };
  }, [range.start, range.end, dated, today]);

  const span = endDay - startDay + 1;
  const ppd = zoom ?? DEFAULT_ZOOM;
  const zoomIdx = ZOOMS.indexOf(ppd);

  // Раскладка по дорожкам
  const placed = useMemo(() => {
    const sorted = [...dated].sort(
      (a, b) => dayIndex(a.start_date!) - dayIndex(b.start_date!) || a.id - b.id,
    );
    const laneEnds: number[] = [];
    return sorted.map((task) => {
      const s = dayIndex(task.start_date!);
      const e = Math.max(s, dayIndex(task.end_date!));
      let lane = laneEnds.findIndex((end) => end < s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e);
      } else {
        laneEnds[lane] = e;
      }
      return { task, s, e, lane };
    });
  }, [dated]);

  const laneCount = Math.max(3, ...placed.map((p) => p.lane + 1));

  const months = useMemo(() => {
    const res: { label: string; left: number; width: number }[] = [];
    let d = startDay;
    while (d <= endDay) {
      const to = Math.min(nextMonthStart(d) - 1, endDay);
      res.push({ label: monthLabel(d), left: (d - startDay) * ppd, width: (to - d + 1) * ppd });
      d = to + 1;
    }
    return res;
  }, [startDay, endDay, ppd]);

  const ticks = useMemo(() => {
    const step = [1, 2, 5, 7, 14, 30].find((s) => s * ppd >= 44) ?? 30;
    const res: number[] = [];
    for (let d = startDay; d <= endDay; d++) if ((d - startDay) % step === 0) res.push(d);
    return res;
  }, [startDay, endDay, ppd]);

  const dayLeft = (d: number) => (d - startDay) * ppd;
  const todayVisible = today >= startDay && today <= endDay;

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (!el) return;
    const target = todayVisible ? dayLeft(today) : placed.length ? dayLeft(placed[0].s) : 0;
    el.scrollTo({ left: Math.max(0, target - 120), behavior: 'smooth' });
  };

  // При открытии сразу показываем «сегодня» (или первую задачу)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = todayVisible ? dayLeft(today) : placed.length ? dayLeft(placed[0].s) : 0;
    el.scrollLeft = Math.max(0, target - 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Перетаскивание как в видеоредакторе: за середину — сдвиг, за края — смена начала/конца (шаг — день) */
  const startDrag = (ev: ReactPointerEvent, task: TaskNode, s: number, e: number, mode: DragState['mode']) => {
    if (!canEdit || !onChangeDates || ev.button !== 0) return;
    ev.stopPropagation();
    ev.preventDefault();
    const el = scrollRef.current;
    const x0 = ev.clientX;
    const sl0 = el?.scrollLeft ?? 0;
    const lo = range.start ? dayIndex(range.start) : -Infinity;
    const hi = range.end ? dayIndex(range.end) : Infinity;
    let state: DragState = { id: task.id, mode, ds: 0, de: 0 };
    let moved = false;

    const onMove = (m: PointerEvent) => {
      if (el) {
        const r = el.getBoundingClientRect();
        if (m.clientX > r.right - 40) el.scrollLeft += 18;
        else if (m.clientX < r.left + 40) el.scrollLeft -= 18;
      }
      const px = m.clientX - x0 + ((el?.scrollLeft ?? 0) - sl0);
      if (!moved && Math.abs(px) < 4) return;
      moved = true;
      const dd = Math.round(px / ppd);
      let ds = 0;
      let de = 0;
      if (mode === 'move') ds = de = Math.min(Math.max(dd, lo - s), hi - e);
      else if (mode === 'l') ds = Math.min(Math.max(dd, lo - s), e - s);
      else de = Math.max(Math.min(dd, hi - e), s - e);
      state = { id: task.id, mode, ds, de };
      setDrag(state);
    };
    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!moved) return setDrag(null);
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      if (state.ds === 0 && state.de === 0) return setDrag(null);
      try {
        await onChangeDates(
          task,
          new Date(Date.parse(task.start_date!) + state.ds * DAY).toISOString(),
          new Date(Date.parse(task.end_date!) + state.de * DAY).toISOString(),
        );
      } finally {
        setDrag(null);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const changeZoom = (delta: number) => {
    const next = ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, zoomIdx + delta))];
    setZoom(next);
  };

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <button className="tl-btn" onClick={scrollToToday}>
          Сегодня
        </button>
        <button
          className="tl-btn tl-btn-icon"
          onClick={() => changeZoom(-1)}
          disabled={zoomIdx <= 0}
          aria-label="Уменьшить масштаб"
        >
          <Icon name="minus" size={16} />
        </button>
        <button
          className="tl-btn tl-btn-icon"
          onClick={() => changeZoom(1)}
          disabled={zoomIdx >= ZOOMS.length - 1}
          aria-label="Увеличить масштаб"
        >
          <Icon name="plus" size={16} />
        </button>
      </div>

      <div className="timeline-scroll" ref={scrollRef} onClick={() => onSelect(null)}>
        <div className="timeline-canvas" style={{ width: span * ppd }}>
          <div className="ruler">
            <div className="ruler-months">
              {months.map((m) => (
                <div key={m.left} className="ruler-month" style={{ left: m.left, width: m.width }}>
                  {m.label}
                </div>
              ))}
            </div>
            <div className="ruler-days">
              {ticks.map((d) => (
                <div key={d} className="ruler-tick" style={{ left: dayLeft(d) }}>
                  {dayOfMonth(d)}
                </div>
              ))}
            </div>
          </div>

          <div
            className="tracks"
            style={{ minHeight: laneCount * (LANE_H + LANE_GAP) + LANE_GAP }}
          >
            {ticks.map((d) => (
              <div key={d} className="grid-line" style={{ left: dayLeft(d) }} />
            ))}
            {todayVisible && (
              <div className="today-line" style={{ left: dayLeft(today) + ppd / 2 }} />
            )}

            {placed.map(({ task, s: s0, e: e0, lane }) => {
              const dr = drag && drag.id === task.id ? drag : null;
              const s = s0 + (dr?.ds ?? 0);
              const e = e0 + (dr?.de ?? 0);
              const width = (e - s + 1) * ppd - 2;
              const isRoadmap = task.type === 'ROADMAP';
              return (
                <button
                  key={task.id}
                  className={`clip ${isRoadmap ? 'clip-roadmap' : 'clip-todo'}${canEdit ? ' clip-editable' : ''}${dr ? ' clip-dragging' : ''}${
                    selectedId === task.id ? ' selected' : ''
                  }`}
                  style={{
                    left: dayLeft(s),
                    width,
                    top: LANE_GAP + lane * (LANE_H + LANE_GAP),
                    height: LANE_H,
                    // статус красит всю плашку целиком
                    background: statusById(task.status_id).color,
                    color: textOn(statusById(task.status_id).color),
                  }}
                  title={`${task.title}\n${formatDay(s)} — ${formatDay(e)}\n${statusById(task.status_id).name}${
                    task.tags.length ? `\n# ${task.tags.map((t) => t.name).join(', ')}` : ''
                  }`}
                  onPointerDown={(ev) => startDrag(ev, task, s0, e0, 'move')}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (suppressClick.current) return;
                    onSelect(task.id);
                  }}
                  onDoubleClick={() => onOpen(task)}
                >
                  {canEdit && <span className="clip-handle clip-handle-l" onPointerDown={(ev) => startDrag(ev, task, s0, e0, 'l')} />}
                  {canEdit && <span className="clip-handle clip-handle-r" onPointerDown={(ev) => startDrag(ev, task, s0, e0, 'r')} />}
                  {dr && (
                    <span className="clip-tip">
                      {formatDay(s)} — {formatDay(e)} · {e - s + 1} дн.
                    </span>
                  )}
                  <span className="clip-title">
                    <Icon name={isRoadmap ? 'roadmap' : 'tasks'} size={14} />
                    {task.title}
                  </span>
                  {width > 150 && (
                    <span className="clip-dates">
                      {formatDay(s)} — {formatDay(e)}
                    </span>
                  )}
                  {task.tags.length > 0 && (
                    <span className="clip-tags">
                      {task.tags.map((t) => (
                        <span
                          key={t.id}
                          className="clip-tag"
                          style={{ background: t.color_code, color: textOn(t.color_code) }}
                        >
                          {t.name}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              );
            })}

            {placed.length === 0 && <div className="tracks-empty">Задач пока нет</div>}
          </div>
        </div>
      </div>

      {undated.length > 0 && (
        <div className="undated">
          <span>Без дат:</span>
          {undated.map((t) => (
            <button
              key={t.id}
              className={selectedId === t.id ? 'chip-btn selected' : 'chip-btn'}
              onClick={() => onSelect(t.id)}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

