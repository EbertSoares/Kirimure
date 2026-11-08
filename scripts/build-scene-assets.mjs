#!/usr/bin/env node
/**
 * Prepara as artes da cena marinha.
 *
 * O material original (src/assets/svg) é grande demais para o navegador: as
 * telas de 1254 px viram megabytes de download e de decodificação antes de a
 * cena aparecer. Este script gera cópias redimensionadas em src/assets/scene,
 * no tamanho máximo que a cena realmente usa.
 *
 * Os arquivos gerados são versionados no repositório, então a aplicação
 * funciona mesmo sem rodar este script. Ele é executado automaticamente pelo
 * servidor de desenvolvimento (vite.config.ts) sempre que uma arte original
 * muda de tamanho ou de data.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_ROOT = join(root, 'src/assets/svg');
const OUTPUT_ROOT = join(root, 'src/assets/scene');
const MANIFEST_PATH = join(OUTPUT_ROOT, 'manifest.json');

// Grupos de arte: pasta de origem e maior lado necessário na cena.
// Peixes aparecem com 54–94 px; corais com 160–230 px; o banco de rochas é o
// único que ocupa quase toda a largura, por isso mantém mais resolução.
const GROUPS = [
  { folder: 'fish', maxSize: 256 },
  { folder: 'coral', maxSize: 448 },
  { folder: 'environment', maxSize: 900 },
  { folder: 'pollution', maxSize: 256 },
];

// Ajustes finos por arquivo: arte que aparece pequena na cena não precisa da
// resolução do grupo.
const FILE_SIZES = {
  'coral-brain-healthy.png': 384,
  'seaweed-green.png': 320,
  'microplastics-mixed.png': 160,
};

const hasSips = process.platform === 'darwin' && (() => {
  try {
    execFileSync('sips', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

const isPng = (name) => name.toLowerCase().endsWith('.png');

function resizeWithSips(source, output, maxSize) {
  execFileSync('sips', ['-Z', String(maxSize), source, '--out', output], { stdio: 'ignore' });
}

function main() {
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const expected = new Set();
  const pending = [];
  const missing = [];

  GROUPS.forEach(({ folder, maxSize }) => {
    const sourceDir = join(SOURCE_ROOT, folder);
    if (!existsSync(sourceDir)) return;

    readdirSync(sourceDir)
      .filter(isPng)
      .forEach((name) => {
        const source = join(sourceDir, name);
        const output = join(OUTPUT_ROOT, basename(name));
        const size = FILE_SIZES[basename(name)] ?? maxSize;
        expected.add(basename(name));

        if (!existsSync(output)) {
          missing.push({ source, output, maxSize: size });
          return;
        }
        if (statSync(source).mtimeMs > statSync(output).mtimeMs + 1000) {
          pending.push({ source, output, maxSize: size });
        }
      });
  });

  // Remove derivados de artes que não existem mais.
  readdirSync(OUTPUT_ROOT)
    .filter((name) => isPng(name) && !expected.has(name))
    .forEach((name) => rmSync(join(OUTPUT_ROOT, name)));

  const todo = [...missing, ...pending];

  if (todo.length > 0) {
    if (!hasSips) {
      // Sem sips (Windows, Linux, CI): copia os arquivos pendentes e ausentes
      // de forma portável via API nativa do Node (copyFileSync), sem depender de comandos shell como 'cp'.
      todo.forEach(({ source, output }) => {
        copyFileSync(source, output);
      });
      console.log(
        `[artes] ${todo.length} arte(s) da cena atualizada(s)/copiada(s) via copyFileSync (sips indisponível nesta plataforma).`,
      );
    } else {
      let bytesBefore = 0;
      let bytesAfter = 0;

      todo.forEach(({ source, output, maxSize }) => {
        resizeWithSips(source, output, maxSize);
        bytesBefore += statSync(source).size;
        bytesAfter += statSync(output).size;
      });

      const mb = (value) => (value / 1024 / 1024).toFixed(1).replace('.', ',');
      console.log(
        `[artes] ${todo.length} arte(s) da cena atualizada(s): ` +
          `${mb(bytesBefore)} MB → ${mb(bytesAfter)} MB.`,
      );
    }
  }

  // Gera o manifesto de integridade dos assets derivados
  const manifest = readdirSync(OUTPUT_ROOT)
    .filter(isPng)
    .sort()
    .map((filename) => {
      const filePath = join(OUTPUT_ROOT, filename);
      const st = statSync(filePath);
      return {
        name: filename,
        sizeBytes: st.size,
        modifiedAt: new Date(st.mtimeMs).toISOString(),
      };
    });

  // Evita que todo `npm run build` suje o worktree apenas por trocar o timestamp.
  // O manifesto só é regravado quando a lista ou a integridade dos derivados muda.
  if (existsSync(MANIFEST_PATH)) {
    try {
      const current = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      if (JSON.stringify(current.assets) === JSON.stringify(manifest)) return;
    } catch {
      // Manifesto inválido: regrava abaixo com a estrutura canônica.
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), assets: manifest }, null, 2), 'utf8');
}

main();
