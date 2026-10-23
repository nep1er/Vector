// Генерирует tokens.css из tokens.json.
// Запуск (из любой папки):  node resources/design/build-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));

const lines = [];
const { dark = {}, ...base } = tokens;
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

// Тёмная тема: переопределяет только то, что описано в tokens.json -> "dark"
const darkLines = [];
for (const [group, values] of Object.entries(dark)) {
  for (const [name, value] of Object.entries(values)) darkLines.push(`  --${group}-${name}: ${value};`);
}

const css =
  '/* Создан автоматически из tokens.json (node build-tokens.mjs). Не редактировать вручную. */\n' +
  `:root {\n${lines.join('\n')}\n}\n` +
  `\n/* Тёмная тема: включается атрибутом data-theme="dark" на <html> */\n:root[data-theme='dark'] {\n  color-scheme: dark;\n${darkLines.join('\n')}\n}\n`;

writeFileSync(join(dir, 'tokens.css'), css);
console.log(`tokens.css: ${lines.length} переменных + ${darkLines.length} для тёмной темы`);
