// Guard: UI colors must reference theme variables (shadcn / Vercel theme); no hard-coded colors or Tailwind palette colors.
// Also flags native pickers, which ignore the theme: choices use the shadcn Select or Autocomplete.
// Usage: npm run check:theme
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src', import.meta.url).pathname;
const skip = ['components/ui', 'routeTree.gen.ts'];
const bad = [
  [/#[0-9a-fA-F]{3,8}\b(?![^'"]*['"]\s*\))/, 'hard-coded hex color'],
  [
    /\b(?:text|bg|border|fill|stroke|ring|from|to|via)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d{2,3}\b/,
    'Tailwind palette color',
  ],
  [/\b(?:rgb|rgba|hsl|hsla|oklch)\(\s*\d/, 'hard-coded color function'],
  [/<(?:select|datalist)\b/, 'native picker (use Select or Autocomplete)'],
];
const files = [];
const walk = d =>
  readdirSync(d).forEach(f => {
    const p = join(d, f);
    if (skip.some(s => p.includes(s))) return;
    statSync(p).isDirectory() ? walk(p) : /\.(tsx?|css)$/.test(f) && files.push(p);
  });
walk(root);
let n = 0;
for (const f of files) {
  if (f.endsWith('styles.css') || f.includes('/theme/')) continue; // the theme definitions themselves
  readFileSync(f, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      for (const [re, why] of bad)
        if (re.test(line) && !line.includes('theme-ok')) {
          console.log(`${f.replace(root, 'src')}:${i + 1}  ${why}: ${line.trim().slice(0, 100)}`);
          n++;
        }
    });
}
if (n) {
  console.log(`\n${n} line(s) bypass the theme. Use theme colors such as var(--background) / text-muted-foreground, and shadcn components for choices.`);
  process.exit(1);
}
console.log('Theme check passed: all colors reference theme variables, no native pickers');
