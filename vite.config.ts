import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

const sceneAssetsScript = fileURLToPath(new URL('./scripts/build-scene-assets.mjs', import.meta.url));

/**
 * Mantém src/assets/scene atualizado a partir das artes originais.
 *
 * A cena carrega as artes redimensionadas (poucos kB por arquivo) em vez dos
 * originais de 1254 px, que somam mais de 12 MB e atrasavam a abertura do
 * recife. Rodar aqui evita depender de um passo manual depois de trocar a arte.
 */
function sceneAssets(): Plugin {
  const prepare = () => {
    if (!existsSync(sceneAssetsScript)) return;
    const result = spawnSync(process.execPath, [sceneAssetsScript], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.warn('[artes] não foi possível preparar as artes da cena.');
    }
  };

  return {
    name: 'kirimure-scene-assets',
    buildStart() {
      prepare();
    },
    configureServer(server) {
      prepare();
      const onSourceChange = (file: string) => {
        if (/src[\\/]assets[\\/]svg[\\/].+\.png$/i.test(file)) prepare();
      };
      server.watcher.on('add', onSourceChange);
      server.watcher.on('change', onSourceChange);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), sceneAssets()],
  server: {
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
