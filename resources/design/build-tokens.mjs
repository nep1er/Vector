// Генерирует tokens.css из tokens.json.
// Запуск (из любой папки):  node resources/design/build-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));

const lines = [];
const { themes = {}, ...base } = tokens;
for (const [group, values] of Object.entries(base)) {
  if (group === 'gradients') {
    for (const [name, [from, to]] of Object.entries(values)) {
      lines.push(`  --gradient-${name}: linear-gradient(135deg, ${from}, ${to});`);
    }
  } else {
    for (const [name, value] of Object.entries(values)) {
      lines.push(`  --${group}-${name}: ${value};`);
    }
  }
}

// Остальные темы: data-theme="dark" (кофейная тёмная), "plain-light" и "plain-dark" (обычные серые).
// Каждая переопределяет только то, что описано в tokens.json -> "themes"
const darkSchemes = new Set(['dark', 'plain-dark']);
let extra = '';
let extraCount = 0;
for (const [theme, groups] of Object.entries(themes)) {
  const out = [];
  for (const [group, values] of Object.entries(groups)) {
    for (const [name, value] of Object.entries(values)) out.push(`  --${group}-${name}: ${value};`);
  }
  extraCount += out.length;
  const scheme = darkSchemes.has(theme) ? '  color-scheme: dark;\n' : '';
  extra += `\n:root[data-theme='${theme}'] {\n${scheme}${out.join('\n')}\n}\n`;
}

const css =
  '/* Создан автоматически из tokens.json (node build-tokens.mjs). Не редактировать вручную. */\n' +
  `:root {\n${lines.join('\n')}\n}\n` +
  '\n/* Темы включаются атрибутом data-theme на <html>: без атрибута/light — кофейная светлая */\n' +
  extra;

writeFileSync(join(dir, 'tokens.css'), css);
console.log(`tokens.css: ${lines.length} переменных + ${extraCount} для дополнительных тем`);
