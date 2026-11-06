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

/** Список запрашиваемых прав с понятными описаниями; администратор проекта отмечает, что разрешает. */
export default function PermissionPicker({ asked, value, onChange, highlight = [], readOnly }: Props) {
  if (asked.length === 0) return <p className="muted">Расширение не запрашивает никаких прав.</p>;
  const toggle = (p: ExtPermission) =>
    onChange?.(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);
  return (
    <ul className="perm-list">
      {asked.map((p) => {
        const info = PERMISSION_INFO[p];
        return (
          <li key={p} className={highlight.includes(p) ? 'perm perm-new' : 'perm'}>
            <label>
              <input type="checkbox" disabled={readOnly} checked={value.includes(p)} onChange={() => toggle(p)} />
              <span className="perm-text">
                <b>{info.label}</b>
                {highlight.includes(p) && <em className="perm-flag">новое право</em>}
                <small className="muted">{info.hint}</small>
              </span>
              <span className={`perm-risk perm-risk-${info.risk}`}>{RISK_LABEL[info.risk]}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
