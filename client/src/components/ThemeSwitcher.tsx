import { THEME_OPTIONS, useTheme } from '../theme/ThemeContext';

/** Переключатель темы: Системная / Светлая / Тёмная. */
export default function ThemeSwitcher() {
  const { pref, setPref } = useTheme();
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Тема оформления">
      {THEME_OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={pref === o.id}
          className={pref === o.id ? 'on' : ''}
          onClick={() => setPref(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
