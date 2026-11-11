import type { ReactNode } from 'react';

/** Обложки расширений: абстрактная графика в фирменной палитре (красный, коричневый, кремовый). Вид выбирается по названию. */
const PALETTES = [
  { from: '#b3262b', to: '#5e1418', a: '#f6ecdc', b: '#e48c84', ink: '#9d1f24', tile: '#fbf4e6' },
  { from: '#3a281b', to: '#241710', a: '#b3262b', b: '#7a5636', ink: '#2a1b11', tile: '#f6ecdc' },
  { from: '#8c6b32', to: '#4a3618', a: '#f0e2c9', b: '#9b1c1c', ink: '#5a4220', tile: '#fbf4e6' },
  { from: '#7a5636', to: '#4a3220', a: '#f0e2c9', b: '#b3262b', ink: '#5e4028', tile: '#fbf4e6' },
  { from: '#2a1d0f', to: '#17100a', a: '#9b1c1c', b: '#8c6b32', ink: '#2a1d0f', tile: '#efdfb5' },
  { from: '#8f2a22', to: '#3a1812', a: '#f2c9a8', b: '#d65a50', ink: '#8f2a22', tile: '#fbf4e6' },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

function shapes(layout: number, a: string, b: string): ReactNode {
  switch (layout) {
    case 0:
      return (
        <>
          <circle cx="262" cy="42" r="92" fill={a} opacity=".16" />
          <circle cx="40" cy="176" r="56" fill={b} opacity=".3" />
          <rect x="196" y="120" width="64" height="64" rx="18" fill={a} opacity=".2" transform="rotate(18 228 152)" />
        </>
      );
    case 1:
      return (
        <>
          <rect x="22" y="70" width="44" height="150" rx="22" fill={a} opacity=".18" />
          <rect x="82" y="30" width="44" height="190" rx="22" fill={b} opacity=".3" />
          <rect x="194" y="-20" width="44" height="150" rx="22" fill={b} opacity=".3" />
          <rect x="254" y="50" width="44" height="190" rx="22" fill={a} opacity=".18" />
        </>
      );
    case 2:
      return (
        <>
          <circle cx="0" cy="200" r="170" fill="none" stroke={a} strokeWidth="26" opacity=".18" />
          <circle cx="0" cy="200" r="112" fill="none" stroke={b} strokeWidth="26" opacity=".3" />
          <circle cx="320" cy="0" r="70" fill={a} opacity=".16" />
        </>
      );
    default:
      return (
        <>
          <path d="M0 200 A160 160 0 0 1 320 200 Z" fill={a} opacity=".14" />
          <path d="M60 200 A100 100 0 0 1 260 200 Z" fill={b} opacity=".26" />
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={34 + i * 18} cy="34" r="3.5" fill={a} opacity=".5" />
          ))}
        </>
      );
  }
}

interface Props {
  name: string;
  slug?: string;
  /** compact — маленький значок вместо обложки (списки) */
  compact?: boolean;
  className?: string;
}

export default function ExtCover({ name, slug, compact, className = '' }: Props) {
  const h = hash(slug || name);
  const p = PALETTES[h % PALETTES.length];
  const layout = Math.floor(h / 7) % 4;
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  const style = { background: `linear-gradient(135deg, ${p.from}, ${p.to})` };
  if (compact) {
    return (
      <span className={`ext-cover-mini ${className}`} style={style} aria-hidden="true">
        <b style={{ color: p.tile }}>{letter}</b>
      </span>
    );
  }
  return (
    <div className={`ext-cover ${className}`} style={style} aria-hidden="true">
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
        {shapes(layout, p.a, p.b)}
      </svg>
      <span className="ext-cover-tile" style={{ background: p.tile, color: p.ink }}>
        {letter}
      </span>
    </div>
  );
}
