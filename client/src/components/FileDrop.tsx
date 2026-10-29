import { useState } from 'react';
import { MAX_UPLOAD_MB } from '../utils/format';

interface Props {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Одна строка вместо большой области — для карточки */
  compact?: boolean;
}

/** Область загрузки: можно перетащить файлы или нажать и выбрать. */
export default function FileDrop({ onFiles, disabled, compact }: Props) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={`filedrop${compact ? ' filedrop-compact' : ''}${over ? ' filedrop-over' : ''}${disabled ? ' filedrop-disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) onFiles([...e.dataTransfer.files]);
      }}
    >
      <input
        type="file"
        multiple
        hidden
        disabled={disabled}
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = '';
          onFiles(picked);
        }}
      />
      <span className="filedrop-main">
        <strong>Загрузить файлы</strong>
        <span className="muted">
          {compact ? 'нажмите или перетащите' : 'Нажмите, чтобы выбрать, или перетащите сюда'} · до {MAX_UPLOAD_MB} МБ
        </span>
      </span>
    </label>
  );
}
