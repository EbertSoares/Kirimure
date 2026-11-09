import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    strictPort: false,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'es2020',
    // Source maps públicos expõem o TypeScript original e ampliavam o deploy em ~24 MB.
    // Gere-os apenas em uma rotina privada de observabilidade, nunca no artefato público padrão.
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
