import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/console/',
  plugins: [react()],
  build: { sourcemap: false, assetsInlineLimit: 0 }, // no inline assets: keeps a strict CSP working
  server: { proxy: { '/v1': 'http://localhost:8787' } },
});
