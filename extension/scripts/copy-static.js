// Copy static files into dist/ for the Chrome extension package
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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

function normalizeHostPermission(rawValue) {
  const value = rawValue?.trim();
  if (!value) return null;
  if (value.endsWith('/*')) return value;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}/*`;
  } catch {
    return null;
  }
}

function addHostPermission(manifest, rawValue) {
  const permission = normalizeHostPermission(rawValue);
  if (!permission) return;

  const hostPermissions = Array.isArray(manifest.host_permissions)
    ? manifest.host_permissions
    : [];

  if (!hostPermissions.includes(permission)) {
    hostPermissions.push(permission);
  }

  manifest.host_permissions = hostPermissions;
}

const manifestPath = resolve(dist, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
addHostPermission(manifest, process.env.VITE_CAREERIQ_API_BASE_URL);

for (const rawPermission of (process.env.VITE_CAREERIQ_EXTENSION_HOST_PERMISSIONS ?? '').split(',')) {
  addHostPermission(manifest, rawPermission);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Copy public/ directory (icons) if it exists
try {
  mkdirSync(resolve(dist, 'public'), { recursive: true });
  cpSync(resolve(root, 'public'), resolve(dist, 'public'), { recursive: true });
} catch {
  // public/ may be empty or missing — that's OK
}

console.log('Static files copied to dist/');
