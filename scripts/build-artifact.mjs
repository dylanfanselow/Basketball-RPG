// Builds the game, then inlines the bundle into one self-contained HTML file (dist/hoop-career.html)
// for hosting as a single page. Usage: npm run build:single
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

execSync('npx vite build', { stdio: 'inherit' });
const jsFile = readdirSync('dist/assets').find((f) => f.endsWith('.js'));
const js = readFileSync(`dist/assets/${jsFile}`, 'utf8').replaceAll('</script', '<\\/script');
const style = readFileSync('index.html', 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1]
  .replace('html, body {', ':root { color-scheme: dark; }\n    html, body { color: #dfe6ff;');
const out = `<meta charset="utf-8">\n<title>Hoop Career</title>\n<style>${style}</style>\n<div id="game"></div>\n<script type="module">${js}</script>\n`;
writeFileSync('dist/hoop-career.html', out);
console.log(`dist/hoop-career.html  ${(out.length / 1024).toFixed(0)} KB`);
