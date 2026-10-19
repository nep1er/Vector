import { useEffect, useState } from 'react';
import type { User } from '../types';

interface Props {
  user: Pick<User, 'username' | 'avatar_url'>;
  size?: number;
}

/** Картинка профиля; если ссылки нет или она не открылась — буква имени. */
export default function Avatar({ user, size = 36 }: Props) {
  const [broken, setBroken] = useState(false);

  // Новая ссылка — даём ей второй шанс
  useEffect(() => setBroken(false), [user.avatar_url]);

  const style = { width: size, height: size, fontSize: size * 0.42 };

  if (user.avatar_url && !broken) {
    return (
      <img
        className="avatar"
        style={style}
        src={user.avatar_url}
        alt={user.username}
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="avatar avatar-letter" style={style} aria-label={user.username}>
      {user.username.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#962020" />
      <path
        d="M7 9l9 15 9-15"
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
