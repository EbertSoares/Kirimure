// Gera src/components/brazilStates.data.ts a partir da malha do IBGE.
//
// A malha de origem tem ~17 MB (1,2 milhão de pontos em segmentos retos).
// Este script reduz a geometria com Douglas-Peucker a um tamanho utilizável
// no navegador e calcula um ponto interno de cada estado para servir de
// âncora para a sigla.
//
// Uso: node scripts/build-brazil-map.mjs

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const SOURCE = fileURLToPath(new URL('../src/assets/svg/brasil-estados (1).svg', import.meta.url));
const OUTPUT = fileURLToPath(new URL('../src/components/brazilStates.data.ts', import.meta.url));

const VIEWBOX_WIDTH = 1100;
const VIEWBOX_HEIGHT = 1000;

// Tolerância em unidades do viewBox (1 unidade ~ 0,6 px na tela).
const TOLERANCE = 0.9;
// Anéis menores que isso são ruído de digitalização ou ilhas minúsculas.
const MIN_RING_AREA = 0.8;

function parsePathData(data) {
  const rings = [];
  let current = null;
  const tokens = data.matchAll(/([MLZ])([^MLZ]*)/g);

  for (const [, command, rawCoordinates] of tokens) {
    if (command === 'M' || command === 'Z') {
      if (current && current.length > 0) rings.push(current);
      current = [];
      if (command === 'Z') current = null;
      if (command === 'M') current = [];
      continue;
    }
    if (!current) current = [];
    const numbers = rawCoordinates.split(/[\s,]+/).filter(Boolean).map(Number);
    for (let index = 0; index < numbers.length; index += 2) {
      if (Number.isFinite(numbers[index]) && Number.isFinite(numbers[index + 1])) {
        current.push([numbers[index], numbers[index + 1]]);
      }
    }
  }
  if (current && current.length > 0) rings.push(current);
  return rings.filter((ring) => ring.length >= 3);
}

function perpendicularDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared;
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(point[0] - (start[0] + clamped * dx), point[1] - (start[1] + clamped * dy));
}

function simplify(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let index = -1;
    for (let cursor = first + 1; cursor < last; cursor += 1) {
      const distance = perpendicularDistance(points[cursor], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = cursor;
      }
    }
    if (index > 0 && maxDistance > epsilon) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  return points.filter((_, index) => keep[index] === 1);
}

function ringArea(points) {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function boundingBox(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function pointInRing(point, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    if (y > point[1] !== previousY > point[1]) {
      const intersectionX = ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
      if (point[0] < intersectionX) inside = !inside;
    }
  }
  return inside;
}

function distanceToRing(point, ring) {
  let best = Infinity;
  for (let index = 0; index < ring.length; index += 1) {
    const distance = perpendicularDistance(point, ring[index], ring[(index + 1) % ring.length]);
    if (distance < best) best = distance;
  }
  return best;
}

// Ponto interno mais distante das bordas (aproximação do polo de inacessibilidade),
// usada para posicionar a sigla sempre dentro do território.
function labelAnchor(ring) {
  const { minX, minY, maxX, maxY } = boundingBox(ring);
  const width = maxX - minX;
  const height = maxY - minY;
  const step = Math.max(0.8, Math.min(width, height) / 70);

  let best = [(minX + maxX) / 2, (minY + maxY) / 2];
  let bestDistance = -1;

  for (let y = minY + step; y < maxY; y += step) {
    for (let x = minX + step; x < maxX; x += step) {
      const point = [x, y];
      if (!pointInRing(point, ring)) continue;
      const distance = distanceToRing(point, ring);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = point;
      }
    }
  }

  return best;
}

function formatRing(ring) {
  const points = ring
    .map(([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`)
    .join(' ');
  return `M${points}Z`;
}

const source = await readFile(SOURCE, 'utf8');
const stateMatches = [...source.matchAll(/<path\b[^>]*?data-uf="([^"]+)"[^>]*?>/g)];

if (stateMatches.length === 0) {
  throw new Error('Nenhum caminho de unidade federativa foi encontrado no SVG de origem.');
}

const states = [];

for (const match of stateMatches) {
  const tag = match[0];
  const code = match[1];
  const name = /data-nome="([^"]+)"/.exec(tag)?.[1] ?? code;
  const region = /data-regiao="([^"]+)"/.exec(tag)?.[1] ?? '';
  const pathData = /\sd="([^"]+)"/.exec(tag)?.[1];
  if (!pathData) continue;

  const rings = parsePathData(pathData)
    .map((ring) => simplify(ring, TOLERANCE))
    .filter((ring) => ring.length >= 3 && ringArea(ring) >= MIN_RING_AREA)
    .sort((first, second) => ringArea(second) - ringArea(first));

  if (rings.length === 0) {
    throw new Error(`${code}: nenhum anel sobreviveu à simplificação.`);
  }

  const [labelX, labelY] = labelAnchor(rings[0]);
  states.push({
    code,
    name,
    region,
    path: rings.map(formatRing).join(''),
    labelX: Math.round(labelX * 10) / 10,
    labelY: Math.round(labelY * 10) / 10,
  });
}

states.sort((first, second) => first.code.localeCompare(second.code));

const file = `// GERADO AUTOMATICAMENTE por scripts/build-brazil-map.mjs — não editar à mão.
// Fonte: malha territorial do IBGE (2025), simplificada para uso no navegador.

export interface BrazilState {
  code: string;
  name: string;
  region: string;
  path: string;
  labelX: number;
  labelY: number;
}

export const BRAZIL_VIEWBOX = { width: ${VIEWBOX_WIDTH}, height: ${VIEWBOX_HEIGHT} } as const;

export const BRAZIL_STATES: BrazilState[] = [
${states
  .map(
    (state) => `  {
    code: '${state.code}',
    name: '${state.name}',
    region: '${state.region}',
    labelX: ${state.labelX},
    labelY: ${state.labelY},
    path: '${state.path}',
  },`,
  )
  .join('\n')}
];
`;

await writeFile(OUTPUT, file, 'utf8');

const sizeInKb = Buffer.byteLength(file, 'utf8') / 1024;
console.log(`Estados: ${states.length}`);
console.log(`Arquivo gerado: ${(sizeInKb / 1024).toFixed(2)} MB (${sizeInKb.toFixed(1)} kB)`);
console.log(`Origem: ${(Buffer.byteLength(source, 'utf8') / 1048576).toFixed(1)} MB`);
console.log('\nÂncoras das siglas:');
for (const state of states) {
  console.log(`  ${state.code}  x=${state.labelX}  y=${state.labelY}`);
}
