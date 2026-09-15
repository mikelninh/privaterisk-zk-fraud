import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  base: '/privaterisk-zk-fraud/',
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/compact-runtime', '@midnight-ntwrk/zkir-v2'],
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  build: {
    target: 'esnext',
  },
});
