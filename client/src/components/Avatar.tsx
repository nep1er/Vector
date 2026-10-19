import { useEffect, useState } from 'react';
import { assetUrl } from '../api';
import type { User } from '../types';

interface Props {
  user: Pick<User, 'username' | 'avatar_url'>;
  size?: number;
}

/** Картинка профиля; если её нет или она не открылась — первая буква имени. */
export default function Avatar({ user, size = 36 }: Props) {
  const [broken, setBroken] = useState(false);
  const src = assetUrl(user.avatar_url);

  useEffect(() => setBroken(false), [src]);

  const style = { width: size, height: size, fontSize: size * 0.42 };

  if (src && !broken) {
    return (
      <img
        className="avatar"
        style={style}
        src={src}
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
