import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const root = resolve(process.env.SITE_ROOT || '.');

export default defineConfig({
  root,
  publicDir: resolve(import.meta.dirname, 'public'),
  base: process.env.SITE_BASE || '/werewolf/dev/',
  build: {
    outDir: resolve(process.env.SITE_OUT || 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, 'index.html'),
        admin: resolve(root, 'admin.html'),
        test: resolve(root, 'test.html'),
      },
    },
  },
});
