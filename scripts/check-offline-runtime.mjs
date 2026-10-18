import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = new URL('../', import.meta.url);
const sourceRoot = new URL('../src/', import.meta.url);
const runtimeExtensions = new Set(['.ts', '.tsx', '.css']);
const forbiddenPatterns = [
  { label: 'URL remota', expression: /https?:\/\//g },
  { label: 'fetch de rede', expression: /\bfetch\s*\(/g },
  { label: 'XMLHttpRequest', expression: /\bXMLHttpRequest\b/g },
  { label: 'WebSocket', expression: /\bWebSocket\b/g },
  { label: 'EventSource', expression: /\bEventSource\b/g },
  { label: 'CSS remoto', expression: /@import\s+(?:url\()?\s*["']?https?:/g },
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

const violations = [];
for (const file of runtimeFiles) {
  const contents = await readFile(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    pattern.expression.lastIndex = 0;
    if (pattern.expression.test(contents)) {
      violations.push(`${relative(projectPath, file)}: ${pattern.label}`);
    }
  }
}

if (violations.length > 0) {
  console.error('O build offline foi bloqueado:');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log(`Auditoria offline aprovada em ${runtimeFiles.length} arquivos de runtime.`);
}
