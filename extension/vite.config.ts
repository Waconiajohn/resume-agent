import { defineConfig } from 'vite';
import { resolve } from 'path';

// Chrome extensions need self-contained scripts (no shared chunks).
// BUILD_ENTRY env var selects which entry to build. The build script
// runs 3 sequential passes. Background uses ES modules (service worker
// supports them), content + popup use IIFE (no module support).

const entry = process.env.BUILD_ENTRY ?? 'content';

const entries: Record<string, string> = {
  background: 'src/background/background.ts',
  content: 'src/content/content.ts',
  popup: 'src/popup/popup.ts',
};

const isESModule = entry === 'background';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: entry === 'background', // First pass cleans, rest append
    rollupOptions: {
      input: resolve(__dirname, entries[entry]),
      output: {
        entryFileNames: `${entry}.js`,
        format: isESModule ? 'es' : 'iife',
        inlineDynamicImports: true,
      },
    },
    target: 'es2022',
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
