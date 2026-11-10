import { defineConfig } from 'vite';

export default defineConfig({
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
});
