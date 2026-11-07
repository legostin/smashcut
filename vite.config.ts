import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = `http://127.0.0.1:${process.env.STUDIO_PORT || 4317}`;
const proxied = ['/api', '/p/', '/runtime', '/vendor', '/fonts', '/gallery', '/library'];

export default defineConfig({
  root: 'web',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries([...proxied.map((p) => [p, { target, changeOrigin: false }]), ['/ws', { target: target.replace('http', 'ws'), ws: true }]]),
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
