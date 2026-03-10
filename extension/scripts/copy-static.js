// Copy static files into dist/ for the Chrome extension package
import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');

const copies = [
  ['manifest.json', 'manifest.json'],
  ['src/popup/popup.html', 'popup.html'],
  ['src/content/content.css', 'content.css'],
];

for (const [src, dest] of copies) {
  cpSync(resolve(root, src), resolve(dist, dest));
}

// Copy public/ directory (icons) if it exists
try {
  mkdirSync(resolve(dist, 'public'), { recursive: true });
  cpSync(resolve(root, 'public'), resolve(dist, 'public'), { recursive: true });
} catch {
  // public/ may be empty or missing — that's OK
}

console.log('Static files copied to dist/');
