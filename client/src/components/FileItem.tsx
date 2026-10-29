import Dropdown from './Dropdown';

interface Props {
  name: string;
  /** file — загруженный файл, link — внешняя ссылка */
  kind: 'file' | 'link';
  /** Вторая строка: размер · автор · дата */
  meta?: string;
  /** Адрес ссылки (для kind="link") */
  href?: string | null;
  /** Скачать файл (для kind="file") */
  onDownload?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  busy?: boolean;
}

const ext = (name: string) => {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? m[1].toUpperCase() : 'FILE';
};

/** Цвет значка по типу файла — чтобы быстро отличать документы, картинки, архивы */
function tone(kind: 'file' | 'link', e: string): string {
  if (kind === 'link') return 'link';
  if (['DOC', 'DOCX', 'PDF', 'TXT', 'ODT', 'RTF', 'MD'].includes(e)) return 'doc';
  if (['XLS', 'XLSX', 'CSV', 'ODS'].includes(e)) return 'sheet';
  if (['PNG', 'JPG', 'JPEG', 'GIF', 'WEBP', 'SVG', 'BMP'].includes(e)) return 'image';
  if (['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(e)) return 'archive';
  return 'other';
}

/** Строка файла или ссылки: значок типа, название, пояснение и меню действий. */
export default function FileItem({ name, kind, meta, href, onDownload, onRename, onDelete, busy }: Props) {
  const e = kind === 'link' ? 'URL' : ext(name);
  const hasMenu = onRename || onDelete;

  const title =
    kind === 'link' ? (
      <a className="fitem-name" href={href ?? '#'} target="_blank" rel="noreferrer noopener" title={name}>
        {name}
      </a>
    ) : (
      <button type="button" className="fitem-name" onClick={onDownload} title={`Скачать «${name}»`}>
        {name}
      </button>
    );

  return (
    <li className="fitem">
      <span className={`fitem-badge fitem-${tone(kind, e)}`} aria-hidden="true">
        {e}
      </span>
      <div className="fitem-main">
        {title}
        {meta && <span className="fitem-meta">{meta}</span>}
      </div>
      <div className="fitem-actions">
        {kind === 'file' && onDownload && (
          <button type="button" className="btn btn-quiet fitem-btn" disabled={busy} onClick={onDownload}>
            Скачать
          </button>
        )}
        {kind === 'link' && (
          <a className="btn btn-quiet fitem-btn" href={href ?? '#'} target="_blank" rel="noreferrer noopener">
            Открыть
          </a>
        )}
        {hasMenu && (
          <Dropdown
            buttonClassName="icon-btn fitem-more"
            ariaLabel={`Действия: ${name}`}
            title="Ещё"
            placement="bottom"
            button={<span aria-hidden="true">⋯</span>}
          >
            <div className="pick-list">
              {onRename && (
                <button type="button" className="pick-item" onClick={onRename}>
                  <span>Переименовать</span>
                </button>
              )}
              {onDelete && (
                <button type="button" className="pick-item pick-danger" onClick={onDelete}>
                  <span>Удалить</span>
                </button>
              )}
            </div>
          </Dropdown>
        )}
      </div>
    </li>
  );
}
