import type { ExtPermission } from '../../types';
import { PERMISSION_INFO, RISK_LABEL } from '../../utils/extensions';

interface Props {
  asked: ExtPermission[];
  value: ExtPermission[];
  onChange?: (v: ExtPermission[]) => void;
  /** права, которых раньше не было — подсвечиваются и требуют явного согласия */
  highlight?: ExtPermission[];
  readOnly?: boolean;
}

/** Список прав: коротко (название + подсказка), с цветом уровня риска. Администратор проекта отмечает, что разрешает. */
export default function PermissionPicker({ asked, value, onChange, highlight = [], readOnly }: Props) {
  if (asked.length === 0) return <p className="muted">Расширение не запрашивает никаких прав.</p>;
  const toggle = (p: ExtPermission) => onChange?.(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <ul className="perm-list">
      {asked.map((p) => {
        const info = PERMISSION_INFO[p];
        const on = value.includes(p);
        const Tag = readOnly ? 'div' : 'label';
        return (
          <li key={p} className={`perm perm-${info.risk}${highlight.includes(p) ? ' perm-new' : ''}${on ? ' perm-on' : ''}`}>
            <Tag className="perm-row">
              {readOnly ? <span className="perm-dot" /> : <input type="checkbox" checked={on} onChange={() => toggle(p)} />}
              <span className="perm-text">
                <b>{info.label}{highlight.includes(p) && <em className="perm-flag">новое</em>}</b>
                <small>{info.hint}</small>
              </span>
              <span className={`perm-risk perm-risk-${info.risk}`}>{RISK_LABEL[info.risk]}</span>
            </Tag>
          </li>
        );
      })}
    </ul>
  );
}
