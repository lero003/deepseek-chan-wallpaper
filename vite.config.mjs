import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { selectArtEntry } from './scripts/art-selection.mjs';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@kujira-art': selectArtEntry(projectRoot, mode) } },
  base: './',
  publicDir: false,
  envDir: false,
  server: { strictPort: true, port: 5173 },
  preview: { strictPort: true, port: 4173 },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    emptyOutDir: true,
  },
}));
