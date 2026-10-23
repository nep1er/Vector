import type { TaskTag } from '../types';
import { EMPTY_FILTERS, TASK_STATUSES, filtersActive } from '../utils/status';
import type { TaskFilters } from '../utils/status';
import Dropdown from './Dropdown';
import Icon from './Icon';

interface Props {
  tags: TaskTag[];
  value: TaskFilters;
  onChange: (next: TaskFilters) => void;
}

const toggle = (list: number[], id: number) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

/**
 * Кнопка «Фильтры» (в панели проекта рядом с «Добавить задачу»).
 * По нажатию открывается меню со всеми фильтрами: статус, теги, период.
 */
export default function RoadmapFilters({ tags, value, onChange }: Props) {
  const count =
    value.statusIds.length + value.tagIds.length + (value.from ? 1 : 0) + (value.to ? 1 : 0);

  return (
    <Dropdown
      placement="right"
      buttonClassName="rail-btn"
      ariaLabel="Фильтры"
      title="Фильтры"
      button={
        <>
          <Icon name="filter" />
          {count > 0 && <span className="rail-badge">{count}</span>}
        </>
      }
    >
      <div className="filter-panel">
        <div className="filter-head">
          <strong>Фильтры</strong>
          {filtersActive(value) && (
            <button type="button" className="link-btn" onClick={() => onChange(EMPTY_FILTERS)}>
              Сбросить
            </button>
          )}
        </div>

        <div className="filter-block">
          <span className="filter-label">Статус</span>
          <div className="chips">
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
        </div>

        <div className="filter-block">
          <span className="filter-label">Теги</span>
          {tags.length === 0 ? (
            <span className="muted hint">В проекте нет тегов</span>
          ) : (
            <div className="chips">
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
        </div>

        <div className="filter-block">
          <span className="filter-label">Период</span>
          <div className="date-grid">
            <input
              type="date"
              aria-label="С даты"
              value={value.from}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
            />
            <input
              type="date"
              aria-label="По дату"
              value={value.to}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
            />
          </div>
        </div>
      </div>
    </Dropdown>
  );
}
