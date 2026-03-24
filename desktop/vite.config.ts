import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  server: {
    port: 5173,
    // Don't use strictPort — if 5173 is taken, Vite picks the next available port.
    // Set VITE_DEV_SERVER_URL env var to match if using a non-default port.
    strictPort: false,
  },
  base: './',
  build: {
    outDir: '../../dist/renderer',
  },
});
