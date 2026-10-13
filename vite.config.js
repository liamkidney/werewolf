import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.env.SITE_ROOT || '.');
// Production and development are sibling checkouts; resolve dependencies from
// the development checkout, where the workflow installs node_modules.
const dependencies = resolve(fileURLToPath(new URL('.', import.meta.url)), 'node_modules');

export default defineConfig({
  root,
  resolve: {
    alias: {
      qrcode: resolve(dependencies, 'qrcode'),
    },
  },
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
