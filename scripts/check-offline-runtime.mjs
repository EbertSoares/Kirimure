import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = new URL('../', import.meta.url);
const sourceRoot = new URL('../src/', import.meta.url);
const runtimeExtensions = new Set(['.ts', '.tsx', '.css']);

// Padrões de tráfego de rede e segredos
const forbiddenPatterns = [
  { label: 'URL remota não autorizada', expression: /https?:\/\//g },
  { label: 'fetch de rede não autorizado', expression: /\bfetch\s*\(/g },
  { label: 'XMLHttpRequest', expression: /\bXMLHttpRequest\b/g },
  { label: 'WebSocket', expression: /\bWebSocket\b/g },
  { label: 'EventSource', expression: /\bEventSource\b/g },
  { label: 'CSS remoto', expression: /@import\s+(?:url\()?\s*["']?https?:/g },
  { label: 'Possível credencial privada embutida', expression: /(?:api[_-]?key|auth[_-]?token|secret[_-]?key)\s*[:=]\s*["'][^"']+["']/gi },
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return nested.flat();
}

const projectPath = fileURLToPath(projectRoot);
const sourcePath = fileURLToPath(sourceRoot);
const runtimeFiles = (await collectFiles(sourcePath)).filter((file) =>
  runtimeExtensions.has(extname(file)),
);
runtimeFiles.push(fileURLToPath(new URL('../index.html', import.meta.url)));

// Diretório estritamente autorizado para clientes de dados / provedores externos com fallback
const authorizedDataLayerPattern = /[\\/]src[\\/]services[\\/]/;

const violations = [];
for (const file of runtimeFiles) {
  const contents = await readFile(file, 'utf8');
  const isDataService = authorizedDataLayerPattern.test(file);

  for (const pattern of forbiddenPatterns) {
    // Camada de serviços autorizada pode usar fetch e URLs públicas dos provedores
    if (isDataService && (pattern.label.includes('URL') || pattern.label.includes('fetch'))) {
      continue;
    }

    pattern.expression.lastIndex = 0;
    if (pattern.expression.test(contents)) {
      violations.push(`${relative(projectPath, file)}: ${pattern.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error('A auditoria de integridade de rede/segurança foi bloqueada:');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log(`Auditoria de segurança e desacoplamento de rede aprovada em ${runtimeFiles.length} arquivos.`);
}
