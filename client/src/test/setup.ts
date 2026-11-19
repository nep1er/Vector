import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// В новых версиях Node (25+) есть собственный глобальный localStorage, который без флага
// --localstorage-file не работает и перекрывает jsdom. Подставляем простое хранилище в памяти.
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(k: string) { return this.data.has(k) ? this.data.get(k)! : null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(k: string) { this.data.delete(k); }
  setItem(k: string, v: string) { this.data.set(k, String(v)); }
}
Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true, writable: true });

// Размонтируем компоненты после каждого теста, чтобы они не влияли друг на друга
afterEach(() => {
  cleanup();
  localStorage.clear();
});
