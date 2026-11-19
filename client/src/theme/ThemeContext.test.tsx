// Система: темы оформления (ThemeContext + ThemeSwitcher)
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { THEME_OPTIONS, ThemeProvider } from './ThemeContext';
import ThemeSwitcher from '../components/ThemeSwitcher';

const setup = () => render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>);

describe('темы', () => {
  it('есть четыре темы', () => {
    expect(THEME_OPTIONS.map((o) => o.id)).toEqual(['system-light', 'system-dark', 'light', 'dark']);
  });

  it('по умолчанию включается «Системная светлая» (jsdom без тёмной темы ОС)', () => {
    setup();
    expect(screen.getByRole('radio', { name: 'Системная светлая' }).getAttribute('aria-checked')).toBe('true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('выбор темы меняет data-theme и запоминается', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Тёмная' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('plain-dark');
    expect(localStorage.getItem('vector_theme')).toBe('dark');
    expect(localStorage.getItem('vector_theme_v')).toBe('3');
  });

  it('сохранённая тема восстанавливается', () => {
    localStorage.setItem('vector_theme', 'light');
    localStorage.setItem('vector_theme_v', '3');
    setup();
    expect(document.documentElement.getAttribute('data-theme')).toBe('plain-light');
  });

  it('старое значение «dark» (до v3) трактуется как кофейная тёмная', () => {
    localStorage.setItem('vector_theme', 'dark');
    setup();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
