import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskNode } from '../types';
import { dayIndex, dayOfMonth, formatDay, monthLabel, nextMonthStart, todayIndex } from '../utils/dates';
import Icon from './Icon';

const ZOOMS = [4, 7, 12, 20, 32, 48, 72]; // пикселей на день
const LANE_H = 44;
const LANE_GAP = 8;

interface Props {
  tasks: TaskNode[];
  /** Границы текущего этапа (если заданы) */
  range: { start: string | null; end: string | null };
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onOpen: (task: TaskNode) => void;
}

/** Дорожки на временной шкале: задачи — «клипы», пересекающиеся по времени ложатся на разные дорожки. */
export default function Timeline({ tasks, range, selectedId, onSelect, onOpen }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);

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
  const fit = [...ZOOMS].reverse().find((z) => span * z <= 980) ?? ZOOMS[0];
  const ppd = zoom ?? fit;
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
            style={{ height: laneCount * (LANE_H + LANE_GAP) + LANE_GAP }}
          >
            {ticks.map((d) => (
              <div key={d} className="grid-line" style={{ left: dayLeft(d) }} />
            ))}
            {todayVisible && (
              <div className="today-line" style={{ left: dayLeft(today) + ppd / 2 }} />
            )}

            {placed.map(({ task, s, e, lane }) => {
              const width = (e - s + 1) * ppd - 2;
              const isRoadmap = task.type === 'ROADMAP';
              return (
                <button
                  key={task.id}
                  className={`clip ${isRoadmap ? 'clip-roadmap' : 'clip-todo'}${
                    selectedId === task.id ? ' selected' : ''
                  }`}
                  style={{
                    left: dayLeft(s),
                    width,
                    top: LANE_GAP + lane * (LANE_H + LANE_GAP),
                    height: LANE_H,
                  }}
                  title={`${task.title}\n${formatDay(s)} — ${formatDay(e)}`}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onSelect(task.id);
                  }}
                  onDoubleClick={() => isRoadmap && onOpen(task)}
                >
                  <span className="clip-title">
                    <Icon name={isRoadmap ? 'roadmap' : 'tasks'} size={14} />
                    {task.title}
                  </span>
                  {width > 150 && (
                    <span className="clip-dates">
                      {formatDay(s)} — {formatDay(e)}
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

