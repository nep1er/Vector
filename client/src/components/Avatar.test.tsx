// Система: аватарки
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Avatar from './Avatar';

describe('Avatar', () => {
  it('без картинки показывает первую букву имени', () => {
    const { container } = render(<Avatar user={{ username: 'Тимофей', avatar_url: null }} />);
    expect(container.textContent?.toUpperCase()).toContain('Т');
    expect(container.querySelector('img')).toBeNull();
  });

  it('с картинкой рисует <img>', () => {
    render(<Avatar user={{ username: 'Anna', avatar_url: '/uploads/a.png' }} size={40} />);
    expect(screen.getByAltText('Anna')).toBeTruthy();
  });

  it('если картинка не открылась — возвращается к букве', () => {
    const { container } = render(<Avatar user={{ username: 'Anna', avatar_url: '/uploads/broken.png' }} />);
    fireEvent.error(screen.getByAltText('Anna'));
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent?.toUpperCase()).toContain('A');
  });
});
