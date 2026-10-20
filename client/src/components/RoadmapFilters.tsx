import type { TaskTag } from '../types';
import { EMPTY_FILTERS, TASK_STATUSES, filtersActive } from '../utils/status';
import type { TaskFilters } from '../utils/status';

interface Props {
  tags: TaskTag[];
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
}

const toggle = (list: number[], id: number) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

/** Фильтры RoadMap: по статусу, тегам и периоду времени. */
export default function RoadmapFilters({ tags, value, onChange }: Props) {
  return (
    <div className="filters" role="group" aria-label="Фильтры">
      <div className="filter-group">
        <span className="filter-label">Статус</span>
        {TASK_STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={value.statusIds.includes(s.id) ? 'fchip on' : 'fchip'}
            onClick={() => onChange({ ...value, statusIds: toggle(value.statusIds, s.id) })}
          >
            <i className="dot" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      {tags.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">Теги</span>
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className={value.tagIds.includes(t.id) ? 'fchip on' : 'fchip'}
              onClick={() => onChange({ ...value, tagIds: toggle(value.tagIds, t.id) })}
            >
              <i className="dot" style={{ background: t.color_code }} />
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="filter-group">
        <span className="filter-label">Период</span>
        <input
          type="date"
          aria-label="С даты"
          value={value.from}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
        <span className="muted">—</span>
        <input
          type="date"
          aria-label="По дату"
          value={value.to}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
        {filtersActive(value) && (
          <button type="button" className="link-btn" onClick={() => onChange(EMPTY_FILTERS)}>
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
