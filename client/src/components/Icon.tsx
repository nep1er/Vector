// Все иконки берутся из общей папки resources/icons — файл = имя иконки.
const modules = import.meta.glob('../../../resources/icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const icons: Record<string, string> = {};
for (const [path, svg] of Object.entries(modules)) {
  const name = path.split('/').pop()!.replace('.svg', '');
  icons[name] = svg;
}

export type IconName =
  | 'folder'
  | 'tasks'
  | 'user'
  | 'settings'
  | 'globe'
  | 'help'
  | 'logout'
  | 'plus'
  | 'camera'
  | 'menu'
  | 'close'
  | 'check'
  | 'bell'
  | 'trash'
  | 'minus'
  | 'roadmap';

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <span
      className="icon"
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icons[name] ?? '' }}
    />
  );
}
