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
      <div className="fp">
        <div className="fp-head">
          <strong>Фильтры</strong>
          {count > 0 && <span className="fp-count">{count}</span>}
        </div>

        <section className="fp-sec">
          <h4>Статус</h4>
          <div className="fp-grid">
            {TASK_STATUSES.map((s) => {
              const on = value.statusIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  className={on ? 'fp-opt on' : 'fp-opt'}
                  onClick={() => onChange({ ...value, statusIds: toggle(value.statusIds, s.id) })}
                >
                  <i className="dot" style={{ background: s.color }} />
                  <span>{s.name}</span>
                  <b className="fp-tick">{on && <Icon name="check" size={12} />}</b>
                </button>
              );
            })}
          </div>
        </section>

        <section className="fp-sec">
          <h4>Теги</h4>
          {tags.length === 0 ? (
            <p className="muted fp-none">В проекте нет тегов</p>
          ) : (
            <div className="fp-grid">
              {tags.map((t) => {
                const on = value.tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={on}
                    className={on ? 'fp-opt on' : 'fp-opt'}
                    onClick={() => onChange({ ...value, tagIds: toggle(value.tagIds, t.id) })}
                  >
                    <i className="dot" style={{ background: t.color_code }} />
                    <span>{t.name}</span>
                    <b className="fp-tick">{on && <Icon name="check" size={12} />}</b>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="fp-sec">
          <h4>Период</h4>
          <div className="fp-dates">
            <label>
              <span>С</span>
              <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
            </label>
            <label>
              <span>По</span>
              <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
            </label>
          </div>
        </section>

        <footer className="fp-foot">
          <button type="button" className="btn btn-quiet" disabled={!filtersActive(value)} onClick={() => onChange(EMPTY_FILTERS)}>
            Сбросить всё
          </button>
        </footer>
      </div>
    </Dropdown>
  );
}
