import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface Props {
  title: string;
  onClose: () => void;
  /** старый флаг: то же, что size="lg" */
  wide?: boolean;
  size?: ModalSize;
  /** строка под заголовком (например, «Версия 1.1.0») */
  subtitle?: string;
  /** закрывать по клику на тёмный фон — только для мелких окон (подтверждения, фильтры) */
  dismissOnBackdrop?: boolean;
  /** произвольная область справа в шапке (кнопки) */
  headerExtra?: ReactNode;
  /** без внутренних отступов — для окон со своей раскладкой (боковое меню + контент) */
  flush?: boolean;
  children: ReactNode;
}

/**
 * Общая оболочка окна: шапка с крестиком, прокручиваемое тело, фиксированные кнопки внизу.
 * Закрывается по крестику и Esc. Клик по фону закрывает окно только при dismissOnBackdrop —
 * чтобы случайным кликом мимо не терять введённое в важных окнах (настройки, карточка, расширения).
 * На телефоне окно занимает весь экран.
 */
export default function Modal({ title, onClose, wide, size, subtitle, dismissOnBackdrop, headerExtra, flush, children }: Props) {
  const s: ModalSize = size ?? (wide ? 'lg' : 'sm');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={dismissOnBackdrop ? onClose : undefined}>
      <div
        className={`modal modal-${s}${flush ? ' modal-flush' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="modal-titles">
            <h2>{title}</h2>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          {headerExtra}
          <button className="icon-btn modal-close" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
