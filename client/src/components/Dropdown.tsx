import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  /** Содержимое кнопки-триггера */
  button: ReactNode;
  buttonClassName?: string;
  ariaLabel: string;
  title?: string;
  /** right — панель справа от кнопки (для узкой панели слева), bottom — под кнопкой */
  placement?: 'right' | 'bottom';
  disabled?: boolean;
  children: ReactNode;
}

/**
 * Кнопка с выпадающей панелью. Панель позиционируется fixed, поэтому её не обрезают
 * контейнеры с overflow. Закрывается по клику снаружи и по Esc.
 */
export default function Dropdown({
  button,
  buttonClassName = 'btn btn-secondary',
  ariaLabel,
  title,
  placement = 'bottom',
  disabled,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({ left: 0, top: 0 });
  const wrap = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      const width = 340;
      if (placement === 'right') {
        // Кнопки панели проекта стоят внизу экрана: если снизу мало места, панель растёт вверх
        if (r.top > window.innerHeight / 2) setPos({ left: r.right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) });
        else setPos({ left: r.right + 8, top: Math.max(8, r.top) });
      } else {
        setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6 });
      }
    }
    setOpen((v) => !v);
  };

  return (
    <span className="dropdown" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className={buttonClassName}
        aria-label={ariaLabel}
        title={title}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
      >
        {button}
      </button>
      {open && (
        <div
          className="dropdown-panel"
          style={{
            left: pos.left,
            ...(pos.bottom !== undefined
              ? { bottom: pos.bottom, maxHeight: `calc(100vh - ${pos.bottom}px - 12px)` }
              : { top: pos.top, maxHeight: `calc(100vh - ${pos.top}px - 12px)` }),
          }}
        >
          {children}
        </div>
      )}
    </span>
  );
}
