/**
 * Batimetria procedural do diorama da Baía de Todos-os-Santos.
 *
 * A superfície d'água fica em `y = 0`. O leito é devolvido em metros negativos
 * entre `SEABED_MIN_DEPTH_M` e `SEABED_MAX_DEPTH_M` (2 a 15 m). O intervalo é
 * uma faixa de composição visual, não uma medição batimétrica do local real.
 *
 * A forma combina:
 *  - rampa litorânea rasa no primeiro plano;
 *  - canal arenoso sinuoso que aprofunda em direção ao fundo do quadro;
 *  - bancadas laterais mais rasas e recifais;
 *  - afloramentos rochosos e depressões locais;
 *  - ondulações de areia de pequena amplitude.
 *
 * Manter este módulo livre de Babylon permite testar a função de altura e a
 * adequação do substrato de forma determinística.
 */

import { clamp, fbm2D, mix, smoothstep } from './procedural';

/** Profundidade mínima de composição (metros abaixo da superfície). */
export const SEABED_MIN_DEPTH_M = 2;
/** Profundidade máxima de composição (metros abaixo da superfície). */
export const SEABED_MAX_DEPTH_M = 15;

/**
 * Profundidade positiva (metros) do leito em `(x, z)`.
 * `z` cresce para o fundo do quadro; `x` é a largura do diorama.
 */
export function seabedDepthAt(x: number, z: number): number {
  // Rampa litorânea: rasa junto à câmera e mais funda ao longe.
  const shore = smoothstep(-4, 24, z);
  let depth = mix(2.1, 6.8, shore);

  // Canal central sinuoso: mantém uma faixa aberta de areia entre as bancadas.
  const channelCenter =
    Math.sin(z * 0.07 + 0.5) * 5.2 +
    Math.sin(z * 0.023 - 1.1) * 3.1;
  const channelWidth = 9.5 + smoothstep(12, 48, z) * 6.5;
  const channel = Math.exp(
    -Math.pow(Math.abs((x - channelCenter) / channelWidth), 2.4),
  );
  depth += channel * (1.0 + smoothstep(5, 44, z) * 6.2);

  // Bacia profunda no fundo do quadro, mais pronunciada no eixo do canal.
  depth += smoothstep(22, 50, z) * 2.8 * (0.35 + 0.65 * channel);

  // Bancadas laterais recifais: reduzem a profundidade e criam declives.
  const bankNoise = fbm2D(x * 0.055 + 2.7, z * 0.06 - 4.2, 4);
  const bank =
    smoothstep(10, 25, Math.abs(x)) *
    (0.55 + 0.45 * bankNoise);
  depth -= bank * 2.6;

  // Afloramentos rochosos: cristas estreitas sobre as bancadas.
  const ridgeNoise = 1 - Math.abs(2 * fbm2D(x * 0.11 - 8.4, z * 0.095 + 3.3, 3) - 1);
  const outcrop =
    smoothstep(0.64, 0.9, ridgeNoise) *
    smoothstep(8, 18, Math.abs(x)) *
    smoothstep(2, 18, z);
  depth -= outcrop * 2.0;

  // Depressões locais, sem criar poços isolados de parede vertical.
  const depression = smoothstep(
    0.58,
    0.8,
    fbm2D(x * 0.045 + 15, z * 0.04 - 9, 3),
  );
  depth += depression * 1.6 * smoothstep(8, 30, z);

  // Ondulações de areia de baixa amplitude.
  depth +=
    Math.sin(x * 0.52 + Math.sin(z * 0.18) * 1.2) * 0.075 +
    Math.sin(z * 0.61 - x * 0.13) * 0.055;

  return clamp(depth, SEABED_MIN_DEPTH_M, SEABED_MAX_DEPTH_M);
}

/** Altura do leito em coordenadas de mundo (superfície em `y = 0`). */
export function seabedHeightAt(x: number, z: number): number {
  return -seabedDepthAt(x, z);
}

/**
 * Adequação do substrato para corais e rochas (0 = areia solta; 1 = hardground).
 *
 * Não desenha nada: apenas informa aos grupos de recife onde é ecológico
 * assentar colônias. O canal arenoso permanece aberto para peixes bentônicos e
 * cáusticas, enquanto as bancadas e cristas recebem a maior parte dos corais.
 */
export function reefSuitabilityAt(x: number, z: number): number {
  const bank = smoothstep(9, 20, Math.abs(x));
  const rough = fbm2D(x * 0.09 + 5.7, z * 0.08 - 2.4, 4);
  const outcrop = 1 - Math.abs(2 * fbm2D(x * 0.16 - 3.2, z * 0.14 + 7.1, 3) - 1);
  const shallow = 1 - smoothstep(10, 15, seabedDepthAt(x, z));

  return clamp(
    bank * smoothstep(0.34, 0.62, rough) * 0.85 +
      smoothstep(0.55, 0.82, outcrop) * shallow * 0.65,
  );
}
