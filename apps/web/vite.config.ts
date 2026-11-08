import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022', sourcemap: false },
  worker: { format: 'es' },
  server: { port: 5199, strictPort: false },
  preview: { port: 4199 },
});
