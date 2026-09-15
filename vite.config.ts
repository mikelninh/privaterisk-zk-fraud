import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  plugins: [react(), wasm()],
  base: '/privaterisk-zk-fraud/',
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/zkir-v2'],
  },
  worker: {
    format: 'es',
    // Modern module workers can preserve top-level await at the esnext target.
    // Avoid the legacy transform plugin here; it corrupts worker output for the
    // current zkir-v2 WASM bundle under Vite 6.
    plugins: () => [wasm()],
  },
  build: {
    target: 'esnext',
  },
});
