import { useEffect, useRef } from 'react';
import { Application, Assets, Container, FillGradient, Graphics, MeshPlane, Sprite, Texture } from 'pixi.js';
import { FISH_SPECIES } from '../simulation/config';
import type { FishSpeciesId, SimulationState } from '../simulation/types';
import { MARINE_ASSET_URLS, type MarineAssetKey } from './assets';

interface MarineSceneProps {
  state: SimulationState;
}

interface FishVisual {
  root: Container;
  healthy: MeshPlane;
  stressed: MeshPlane;
  dead: MeshPlane;
  meshes: MeshPlane[];
  basePositions: Float32Array;
  speed: number;
  phase: number;
  threshold: number;
  direction: 1 | -1;
  size: number;
  textureWidth: number;
  displayScale: number;
  yRatio: number;
  deathDrift: 1 | -1;
  speciesId: FishSpeciesId;
}

interface DrifterVisual {
  sprite: Sprite;
  kind: 'squid' | 'jellyfish';
  xRatio: number;
  yRatio: number;
  phase: number;
  speed: number;
  displayScale: number;
  threshold: number;
}

interface CoralVisual {
  root: Container;
  healthy: Sprite;
  pale: Sprite;
  partial: Sprite;
  bleached: Sprite;
  dead: Sprite;
  xRatio: number;
  yRatio: number;
  sizeRatio: number;
  direction: 1 | -1;
  sensitivity: number;
}

interface DecorVisual {
  sprite: Sprite;
  xRatio: number;
  yRatio: number;
  sizeRatio: number;
  direction: 1 | -1;
}

interface ParticleVisual {
  shape: Graphics;
  speedX: number;
  speedY: number;
  phase: number;
}

interface DebrisVisual {
  sprite: Sprite;
  speedX: number;
  speedY: number;
  phase: number;
  scale: number;
}

type MarineTextures = Record<MarineAssetKey, Texture>;

const SOURCE_SIZE = 1254;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadMarineTextures(): Promise<MarineTextures> {
  const entries = await Promise.all(
    Object.entries(MARINE_ASSET_URLS).map(async ([key, url]) => {
      const texture = await Assets.load<Texture>(url);
      return [key, texture] as const;
    }),
  );

  return Object.fromEntries(entries) as MarineTextures;
}

function layeredSprite(texture: Texture) {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  return sprite;
}

function layeredFishMesh(texture: Texture) {
  const mesh = new MeshPlane({ texture, verticesX: 10, verticesY: 3 });
  mesh.pivot.set(texture.width / 2, texture.height / 2);
  return mesh;
}

function createFish(index: number, textures: MarineTextures): FishVisual {
  const root = new Container();
  const variants = [
    [textures.fishBlueTangHealthy, textures.fishBlueTangStressed],
    [textures.fishSergeantMajorHealthy, textures.fishSergeantMajorStressed],
    [textures.fishParrotfishHealthy, textures.fishParrotfishStressed],
  ] as const;
  const variantIndex = index % variants.length;
  const [healthyTexture, stressedTexture] = variants[variantIndex];
  const speciesId = FISH_SPECIES[variantIndex].id;
  const healthy = layeredFishMesh(healthyTexture);
  const stressed = layeredFishMesh(stressedTexture);
  // Os peixes têm arte própria para saudável e estressado. O estado morto
  // reaproveita a arte de estresse com um tom acinzentado.
  const dead = layeredFishMesh(stressedTexture);
  dead.tint = 0x8b9aa0;
  stressed.alpha = 0;
  dead.alpha = 0;
  root.addChild(healthy, stressed, dead);
  const size = 57 + (index % 4) * 9;
  const textureWidth = healthyTexture.width;

  return {
    root,
    healthy,
    stressed,
    dead,
    meshes: [healthy, stressed, dead],
    basePositions: healthy.geometry.positions.slice(),
    speed: 13 + (index % 5) * 4,
    phase: index * 0.78,
    threshold: 5 + ((index * 37) % 91),
    direction: index % 3 === 0 ? -1 : 1,
    size,
    textureWidth,
    displayScale: size / textureWidth,
    yRatio: 0.14 + ((index * 0.173) % 0.56),
    deathDrift: index % 2 === 0 ? 1 : -1,
    speciesId,
  };
}

function createDrifter(
  texture: Texture,
  kind: DrifterVisual['kind'],
  index: number,
  xRatio: number,
  yRatio: number,
): DrifterVisual {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5);
  const desiredWidth = kind === 'squid' ? 38 + (index % 2) * 8 : 31 + (index % 3) * 7;
  return {
    sprite,
    kind,
    xRatio,
    yRatio,
    phase: index * 1.37 + (kind === 'squid' ? 0.4 : 2.1),
    speed: kind === 'squid' ? 4.5 + index : 1.5 + index * 0.35,
    displayScale: desiredWidth / texture.width,
    threshold: kind === 'squid' ? 34 + index * 8 : 22 + index * 7,
  };
}

function createCoral(
  textures: MarineTextures,
  xRatio: number,
  yRatio: number,
  sizeRatio: number,
  direction: 1 | -1,
  sensitivity = 0,
): CoralVisual {
  const root = new Container();
  const healthy = layeredSprite(textures.coralBranchingHealthy);
  const pale = layeredSprite(textures.coralBranchingPaleTips);
  const partial = layeredSprite(textures.coralBranchingPartiallyBleached);
  const bleached = layeredSprite(textures.coralBranchingBleached);
  const dead = layeredSprite(textures.coralBranchingBleached);
  [healthy, pale, partial, bleached, dead].forEach((sprite) => sprite.anchor.set(0.5, 0.92));
  pale.alpha = 0;
  partial.alpha = 0;
  bleached.alpha = 0;
  dead.alpha = 0;
  dead.tint = 0x70806b;
  root.addChild(healthy, pale, partial, bleached, dead);
  return { root, healthy, pale, partial, bleached, dead, xRatio, yRatio, sizeRatio, direction, sensitivity };
}

function createDecor(
  texture: Texture,
  xRatio: number,
  yRatio: number,
  sizeRatio: number,
  direction: 1 | -1 = 1,
): DecorVisual {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, 0.92);
  return { sprite, xRatio, yRatio, sizeRatio, direction };
}

function drawBackground(graphics: Graphics, width: number, height: number, waterGradient: FillGradient) {
  graphics.clear();
  graphics.rect(0, 0, width, height).fill(waterGradient);
  // Banho de luz logo abaixo da superfície.
  graphics.ellipse(width * 0.5, -height * 0.05, width * 0.66, height * 0.24).fill({ color: 0xbdf6ff, alpha: 0.16 });
  // Escurecimento progressivo nas profundezas.
  for (let index = 0; index < 10; index += 1) {
    const slice = height * 0.5 / 10;
    graphics
      .rect(0, height * 0.5 + slice * index, width, slice + 1)
      .fill({ color: 0x01232f, alpha: 0.055 });
  }
  // Areia do fundo, com banco mais claro em primeiro plano.
  graphics.ellipse(width * 0.5, height * 1.05, width * 0.82, height * 0.27).fill(0xcab787);
  graphics.ellipse(width * 0.24, height * 1.1, width * 0.44, height * 0.17).fill({ color: 0xd9c79b, alpha: 0.7 });
}

function drawLight(graphics: Graphics, width: number, height: number) {
  graphics.clear();
  [0.08, 0.24, 0.42, 0.6, 0.76, 0.9].forEach((origin, index) => {
    const spread = 0.045 + (index % 3) * 0.014;
    graphics
      .poly([
        width * origin,
        0,
        width * (origin + spread),
        0,
        width * (origin + spread * 3.6),
        height * 0.84,
        width * (origin - spread * 1.7),
        height * 0.84,
      ])
      .fill({ color: 0xe8ffff, alpha: 0.04 + (index % 2) * 0.013 });
  });
}

function drawDistantReef(graphics: Graphics, width: number, height: number) {
  graphics.clear();
  graphics
    .poly([
      0, height * 0.78,
      width * 0.09, height * 0.72,
      width * 0.19, height * 0.75,
      width * 0.31, height * 0.68,
      width * 0.45, height * 0.74,
      width * 0.58, height * 0.7,
      width * 0.72, height * 0.76,
      width * 0.84, height * 0.69,
      width, height * 0.74,
      width, height,
      0, height,
    ])
    .fill({ color: 0x073f50, alpha: 0.2 });

  // Recife distante mais profundo, quase dissolvido na água.
  graphics
    .poly([
      0, height * 0.9,
      width * 0.2, height * 0.86,
      width * 0.4, height * 0.9,
      width * 0.62, height * 0.85,
      width * 0.82, height * 0.89,
      width, height * 0.86,
      width, height,
      0, height,
    ])
    .fill({ color: 0x02222c, alpha: 0.34 });

  for (let index = 0; index < 15; index += 1) {
    const x = width * (0.03 + index * 0.068);
    const baseY = height * (0.79 + (index % 3) * 0.025);
    const plantHeight = height * (0.055 + (index % 4) * 0.014);
    graphics
      .moveTo(x, baseY)
      .quadraticCurveTo(x - width * 0.008, baseY - plantHeight * 0.55, x + width * 0.004, baseY - plantHeight)
      .moveTo(x, baseY - plantHeight * 0.35)
      .lineTo(x - width * 0.012, baseY - plantHeight * 0.63)
      .moveTo(x, baseY - plantHeight * 0.48)
      .lineTo(x + width * 0.013, baseY - plantHeight * 0.76)
      .stroke({ color: 0x0a5261, alpha: 0.3, width: Math.max(1.5, width * 0.002) });
  }
}

/** Faixa luminosa da superfície. */
function drawSurfaceBand(graphics: Graphics, width: number, height: number) {
  graphics.clear();
  const band = Math.max(30, height * 0.06);
  const slices = 9;
  for (let index = 0; index < slices; index += 1) {
    graphics
      .rect(0, (band / slices) * index, width, band / slices + 1)
      .fill({ color: 0xcaf7ff, alpha: 0.2 * (1 - index / slices) });
  }
}

/** Ondas da superfície: desenhadas em dobro para deslizar sem emenda. */
function drawSurfaceWaves(graphics: Graphics, width: number) {
  graphics.clear();
  const span = width * 2;
  for (let index = 0; index < 30; index += 1) {
    const x = (span / 29) * index;
    const y = 13 + (index % 4) * 5;
    graphics
      .moveTo(x - 62, y)
      .quadraticCurveTo(x, y - 10 - (index % 3) * 3, x + 64, y)
      .stroke({ color: 0xeafcff, alpha: 0.3, width: 2.2 });
  }
}

/** Cáusticas: reflexos da luz do sol que dan movimento ao topo da cena. */
function drawCaustics(graphics: Graphics, width: number, height: number) {
  graphics.clear();
  const span = width * 2;
  for (let index = 0; index < 16; index += 1) {
    const x = (span / 15) * index;
    const y = height * (0.035 + (index % 5) * 0.038);
    graphics
      .moveTo(x - 95, y)
      .quadraticCurveTo(x, y + 18 - (index % 3) * 11, x + 95, y)
      .stroke({ color: 0xe4ffff, alpha: 0.11, width: 3 });
  }
}

/** Nevoeiro único usado para turbidez e esgoto. */
function fillHaze(graphics: Graphics, width: number, height: number, color: number) {
  graphics.clear();
  graphics.rect(0, 0, width, height).fill(color);
}


function updateCoralState(coral: CoralVisual, health: number) {
  const individualHealth = clamp((health + coral.sensitivity) / 100) * 100;
  const healthyToPale = clamp((100 - individualHealth) / 25);
  const paleToPartial = clamp((75 - individualHealth) / 25);
  const partialToBleached = clamp((50 - individualHealth) / 34);
  const mortality = clamp((18 - individualHealth) / 18);

  coral.healthy.alpha = 1 - healthyToPale;
  coral.pale.alpha = healthyToPale * (1 - paleToPartial);
  coral.partial.alpha = paleToPartial * (1 - partialToBleached);
  coral.bleached.alpha = partialToBleached * (1 - mortality);
  coral.dead.alpha = mortality;
}

function deformFish(fish: FishVisual, elapsed: number, health: number) {
  const stress = clamp((70 - health) / 70);
  // Os PNGs usam uma tela de 1254 px e são reduzidos para cerca de 54–94 px.
  // A deformação precisa acontecer na escala da textura para continuar visível
  // depois da redução. O peso quadrático mantém a cabeça estável e concentra o
  // movimento no pedúnculo e na cauda, como numa ondulação corporal real.
  const frequency = 4.2 + fish.speed * 0.055 + stress * 1.6;
  const amplitude = 48 + fish.speed * 0.85 + stress * 25;

  fish.meshes.forEach((mesh) => {
    const positions = mesh.geometry.positions;
    for (let index = 0; index < positions.length; index += 2) {
      const baseX = fish.basePositions[index];
      const baseY = fish.basePositions[index + 1];
      const normalizedX = baseX / fish.textureWidth;
      const tailWeight = clamp((normalizedX - 0.25) / 0.75);
      const wave = Math.sin(elapsed * frequency - normalizedX * 7.2 + fish.phase);
      const bodyWave = wave * amplitude * tailWeight * tailWeight;
      positions[index] = baseX - Math.abs(bodyWave) * tailWeight * 0.035;
      positions[index + 1] = baseY + bodyWave;
    }
    mesh.geometry.attributes.aPosition.buffer.update();
  });
}

function restoreFishBody(fish: FishVisual) {
  fish.meshes.forEach((mesh) => {
    mesh.geometry.positions.set(fish.basePositions);
    mesh.geometry.attributes.aPosition.buffer.update();
  });
}

function updateFishState(fish: FishVisual, health: number) {
  const weakStart = fish.threshold + 15;
  const stressAmount = clamp((weakStart - health) / 15);
  const deathAmount = clamp((fish.threshold - health) / 18);
  fish.healthy.alpha = 1 - stressAmount;
  fish.stressed.alpha = stressAmount * (1 - deathAmount);
  fish.dead.alpha = deathAmount;
  fish.root.alpha = health <= Math.max(0, fish.threshold - 30)
    ? clamp(health / Math.max(1, fish.threshold - 30))
    : 0.94;
}

export function MarineScene({ state }: MarineSceneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let app: Application | null = null;
    let observer: ResizeObserver | null = null;
    let waterGradient: FillGradient | null = null;

    const start = async () => {
      const instance = new Application();
      await instance.init({
        resizeTo: host,
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      });

      if (disposed) {
        instance.destroy(true);
        return;
      }

      app = instance;
      host.appendChild(instance.canvas);

      // O Pixi não acompanha o tamanho do contêiner sozinho: quando a bancada
      // é recolhida, a cena cresce e o renderer precisa ser redimensionado
      // para o fundo, as rochas e os corais se reposicionarem.
      const resizeObserver = new ResizeObserver(() => {
        if (!app) return;
        const { clientWidth, clientHeight } = host;
        if (clientWidth > 0 && clientHeight > 0) {
          app.renderer.resize(clientWidth, clientHeight);
        }
      });
      resizeObserver.observe(host);
      observer = resizeObserver;

      const gradient = new FillGradient({
        type: 'linear',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 1 },
        textureSpace: 'local',
        colorStops: [
          { offset: 0, color: 0x74e0ee },
          { offset: 0.08, color: 0x36bcd0 },
          { offset: 0.26, color: 0x1599b3 },
          { offset: 0.52, color: 0x0a728c },
          { offset: 0.76, color: 0x055066 },
          { offset: 1, color: 0x02303d },
        ],
      });
      waterGradient = gradient;

      const background = new Graphics();
      const distantReef = new Graphics();
      const light = new Graphics();
      const caustics = new Graphics();
      const snowLayer = new Container();
      const rocksLayer = new Container();
      const fishLayer = new Container();
      const driftingFaunaLayer = new Container();
      const vegetationLayer = new Container();
      const coralLayer = new Container();
      const particlesLayer = new Container();
      const debrisLayer = new Container();
      const organicLayer = new Container();
      const sedimentHaze = new Graphics();
      const sewageHaze = new Graphics();
      const waterTint = new Graphics();
      const oilSurface = new Graphics();
      const oilSheen = new Graphics();
      const surfaceBand = new Graphics();
      const surfaceWaves = new Graphics();
      instance.stage.addChild(
        background,
        distantReef,
        light,
        caustics,
        snowLayer,
        rocksLayer,
        fishLayer,
        driftingFaunaLayer,
        vegetationLayer,
        coralLayer,
        particlesLayer,
        debrisLayer,
        organicLayer,
        sedimentHaze,
        sewageHaze,
        waterTint,
        oilSurface,
        oilSheen,
        surfaceBand,
        surfaceWaves,
      );

      const textures = await loadMarineTextures();
      if (disposed) return;

      const rocks = [
        createDecor(textures.reefRocksSand, 0.15, 0.98, 0.42, 1),
        createDecor(textures.reefRocksSand, 0.86, 1.01, 0.48, -1),
      ];
      rocks.forEach(({ sprite }) => rocksLayer.addChild(sprite));

      const vegetation = [
        createDecor(textures.seaweedGreen, 0.09, 0.98, 0.17, 1),
        createDecor(textures.seaweedGreen, 0.29, 1.01, 0.13, -1),
        createDecor(textures.seaweedGreen, 0.7, 1.01, 0.14, 1),
        createDecor(textures.seaweedGreen, 0.92, 0.98, 0.18, -1),
      ];
      vegetation.forEach(({ sprite }, index) => {
        sprite.tint = index % 2 ? 0x8ecb73 : 0xffffff;
        vegetationLayer.addChild(sprite);
      });

      const corals = [
        createCoral(textures, 0.12, 1.01, 0.22, 1, 7),
        createCoral(textures, 0.28, 1.03, 0.16, -1, -5),
        createCoral(textures, 0.74, 1.03, 0.17, 1, 3),
        createCoral(textures, 0.9, 1.01, 0.23, -1, -9),
      ];
      corals.forEach(({ root }) => coralLayer.addChild(root));

      const brainCorals = [
        createDecor(textures.coralBrainHealthy, 0.23, 0.98, 0.2, 1),
        createDecor(textures.coralBrainHealthy, 0.8, 1.01, 0.16, -1),
      ];
      brainCorals.forEach(({ sprite }) => coralLayer.addChild(sprite));

      const fish = Array.from({ length: 18 }, (_, index) => {
        const visual = createFish(index, textures);
        fishLayer.addChild(visual.root);
        return visual;
      });

      const drifters = [
        createDrifter(textures.squidCaribbeanReef, 'squid', 0, 0.18, 0.3),
        createDrifter(textures.squidCaribbeanReef, 'squid', 1, 0.72, 0.24),
        createDrifter(textures.squidCaribbeanReef, 'squid', 2, 0.47, 0.48),
        createDrifter(textures.jellyfishMoon, 'jellyfish', 0, 0.32, 0.19),
        createDrifter(textures.jellyfishMoon, 'jellyfish', 1, 0.61, 0.36),
        createDrifter(textures.jellyfishMoon, 'jellyfish', 2, 0.84, 0.16),
      ];
      drifters.forEach(({ sprite }) => driftingFaunaLayer.addChild(sprite));

      const random = mulberry32(7021);
      const particles: ParticleVisual[] = Array.from({ length: 240 }, (_, index) => {
        const shape = new Graphics();
        const colors = [
          0x101820, 0x101820, 0x101820, 0x263642, 0x263642,
          0xef5b4c, 0xf4c542, 0x4aa8df, 0x55b96f, 0xad75ca,
        ];
        const size = 1.6 + random() * 3.8;
        shape.rect(-size / 2, -size / 2, size, size * (0.55 + random())).fill(colors[index % colors.length]);
        shape.rotation = random() * Math.PI;
        particlesLayer.addChild(shape);
        return {
          shape,
          speedX: -3 + random() * 6,
          speedY: 2 + random() * 7,
          phase: random() * Math.PI * 2,
        };
      });

      const debris: DebrisVisual[] = Array.from({ length: 6 }, (_, index) => {
        const sprite = new Sprite(textures.microplasticsMixed);
        sprite.anchor.set(0.5);
        debrisLayer.addChild(sprite);
        return {
          sprite,
          speedX: -2 + random() * 4,
          speedY: 1.5 + random() * 4,
          phase: random() * Math.PI * 2,
          scale: 0.09 + (index % 3) * 0.015,
        };
      });

      // Neve marinha: partículas claras que dão profundidade e movimento à água.
      const snow = Array.from({ length: 110 }, () => {
        const dot = new Graphics();
        dot.circle(0, 0, 0.7 + random() * 1.6).fill({ color: 0xe6fbff, alpha: 0.35 + random() * 0.4 });
        snowLayer.addChild(dot);
        return {
          dot,
          speedX: -2.5 + random() * 5,
          speedY: 3 + random() * 8,
          phase: random() * Math.PI * 2,
        };
      });

      // Matéria orgânica do esgoto: manchas esverdeadas em suspensão.
      const organic = Array.from({ length: 80 }, (_, index) => {
        const blob = new Graphics();
        blob
          .circle(0, 0, 1.6 + random() * 2.8)
          .fill({ color: index % 3 === 0 ? 0x86a34e : 0x5f7f3a, alpha: 0.75 });
        organicLayer.addChild(blob);
        return {
          blob,
          speedX: -3 + random() * 6,
          speedY: 4 + random() * 9,
          phase: random() * Math.PI * 2,
        };
      });

      let previousWidth = 0;
      let previousHeight = 0;
      let elapsed = 0;

      instance.ticker.add((ticker) => {
        elapsed += ticker.deltaMS / 1000;
        const delta = ticker.deltaMS / 1000;
        const width = instance.screen.width;
        const height = instance.screen.height;
        const current = stateRef.current;
        const resized = width !== previousWidth || height !== previousHeight;

        if (resized) {
          previousWidth = width;
          previousHeight = height;
          drawBackground(background, width, height, gradient);
          drawDistantReef(distantReef, width, height);
          drawLight(light, width, height);
          drawCaustics(caustics, width, height);
          drawSurfaceBand(surfaceBand, width, height);
          drawSurfaceWaves(surfaceWaves, width);
          fillHaze(sedimentHaze, width, height, 0xb8a678);
          fillHaze(sewageHaze, width, height, 0x6f8a41);
          waterTint.clear().rect(0, 0, width, height).fill(0x152f38);
          oilSurface.clear().rect(0, 0, width, Math.max(20, height * 0.075)).fill(0x241d16);
          oilSheen.clear();
          oilSheen
            .ellipse(width * 0.2, height * 0.04, width * 0.2, height * 0.026)
            .ellipse(width * 0.58, height * 0.026, width * 0.28, height * 0.021)
            .ellipse(width * 0.86, height * 0.055, width * 0.13, height * 0.018)
            .fill({ color: 0x6c4f8f, alpha: 0.48 });

          rocks.forEach((rock) => {
            rock.sprite.x = width * rock.xRatio;
            rock.sprite.y = height * rock.yRatio;
            const scale = (width * rock.sizeRatio) / SOURCE_SIZE;
            rock.sprite.scale.set(scale * rock.direction, scale);
          });
          vegetation.forEach((plant) => {
            plant.sprite.x = width * plant.xRatio;
            plant.sprite.y = height * plant.yRatio;
            const scale = (width * plant.sizeRatio) / SOURCE_SIZE;
            plant.sprite.scale.set(scale * plant.direction, scale);
          });
          corals.forEach((coral) => {
            coral.root.x = width * coral.xRatio;
            coral.root.y = height * coral.yRatio;
            const scale = (width * coral.sizeRatio) / SOURCE_SIZE;
            coral.root.scale.set(scale * coral.direction, scale);
          });
          brainCorals.forEach((coral) => {
            coral.sprite.x = width * coral.xRatio;
            coral.sprite.y = height * coral.yRatio;
            const scale = (width * coral.sizeRatio) / SOURCE_SIZE;
            coral.sprite.scale.set(scale * coral.direction, scale);
          });
          fish.forEach((visual, index) => {
            visual.root.x = width * (0.06 + ((index * 0.143) % 0.88));
            visual.root.y = height * visual.yRatio;
            const scale = visual.displayScale;
            // A arte-base olha para a esquerda; a escala horizontal precisa ser
            // oposta ao sinal usado pelo deslocamento para que o peixe nade de frente.
            visual.root.scale.set(scale * -visual.direction, scale);
          });
          drifters.forEach((visual) => {
            visual.sprite.x = width * visual.xRatio;
            visual.sprite.y = height * visual.yRatio;
            visual.sprite.scale.set(visual.displayScale);
          });
          particles.forEach((particle) => {
            particle.shape.x = random() * width;
            particle.shape.y = height * (0.12 + random() * 0.68);
          });
          debris.forEach((item) => {
            item.sprite.x = width * (0.15 + random() * 0.7);
            item.sprite.y = height * (0.16 + random() * 0.52);
            item.sprite.scale.set(item.scale);
          });
          snow.forEach((flake) => {
            flake.dot.x = random() * width;
            flake.dot.y = random() * height;
          });
          organic.forEach((blob) => {
            blob.blob.x = random() * width;
            blob.blob.y = random() * height;
          });
        }

        corals.forEach((coral) => updateCoralState(coral, current.health.coral));
        brainCorals.forEach(({ sprite }) => {
          const stress = 1 - current.health.coral / 100;
          sprite.tint = stress > 0.62 ? 0xd2d0bc : stress > 0.3 ? 0xf0d19a : 0xffffff;
          sprite.alpha = 0.95 - stress * 0.28;
        });

        const fishHealth = current.health.fish;
        fish.forEach((visual, index) => {
          // Cada espécie tem a própria curva de saúde e tolera os fatores de
          // forma diferente; o peixe usa a saúde da sua espécie.
          const speciesHealth = current.species[visual.speciesId] ?? fishHealth;
          const alive = speciesHealth >= visual.threshold;
          updateFishState(visual, speciesHealth);
          const stress = clamp((75 - speciesHealth) / 75);

          if (alive) {
            deformFish(visual, elapsed, speciesHealth);
            const travelSpeed = visual.speed * (1 - stress * 0.46);
            visual.root.x += travelSpeed * visual.direction * delta;
            const laneY = height * visual.yRatio;
            const cruiseWave = Math.sin(elapsed * 0.55 + visual.phase) * height * 0.018;
            const finCorrection = Math.sin(elapsed * 1.65 + visual.phase * 1.7) * 2.2;
            const targetY = laneY + cruiseWave + finCorrection;
            visual.root.y += (targetY - visual.root.y) * Math.min(1, delta * (0.75 + stress * 0.35));
            visual.root.rotation = Math.sin(elapsed * 0.72 + visual.phase) * (0.026 + stress * 0.055);
            visual.root.scale.y = visual.displayScale * (1 + Math.sin(elapsed * 2.1 + visual.phase) * 0.012);
          } else {
            restoreFishBody(visual);
            const targetRotation = visual.deathDrift * Math.PI * 0.48;
            visual.root.rotation += (targetRotation - visual.root.rotation) * Math.min(1, delta * 0.75);
            visual.root.y += visual.deathDrift * 3.2 * delta;
            visual.root.scale.y = visual.displayScale;
          }

          const margin = visual.size * 0.45;
          if (alive && visual.root.x > width - margin) visual.direction = -1;
          if (alive && visual.root.x < margin) visual.direction = 1;
          const targetScaleX = visual.displayScale * -visual.direction;
          visual.root.scale.x += (targetScaleX - visual.root.scale.x) * Math.min(1, delta * 5.5);

          if (alive && (visual.root.y < height * 0.08 || visual.root.y > height * 0.76)) {
            visual.root.y = height * visual.yRatio;
          } else if (!alive) {
            visual.root.y = Math.min(height * 0.86, Math.max(height * 0.06, visual.root.y));
          }
          if (index % 4 === 0) visual.root.alpha *= 0.84;
        });

        drifters.forEach((visual) => {
          const alive = fishHealth >= visual.threshold;
          const pulse = Math.sin(elapsed * (visual.kind === 'jellyfish' ? 2.2 : 1.45) + visual.phase);
          if (alive) {
            visual.sprite.x += visual.speed * delta;
            visual.sprite.y = height * visual.yRatio + Math.sin(elapsed * 0.55 + visual.phase) * height * 0.022;
            visual.sprite.rotation = Math.sin(elapsed * 0.42 + visual.phase) * 0.09;
            const pulseScale = 1 + pulse * (visual.kind === 'jellyfish' ? 0.055 : 0.025);
            visual.sprite.scale.set(visual.displayScale * pulseScale, visual.displayScale / pulseScale);
          } else {
            visual.sprite.rotation += (Math.PI * 0.55 - visual.sprite.rotation) * Math.min(1, delta * 0.55);
            visual.sprite.y += 2.1 * delta;
            visual.sprite.scale.set(visual.displayScale);
          }
          visual.sprite.tint = alive ? 0xffffff : 0x829096;
          visual.sprite.alpha = 0.88 * clamp(fishHealth / Math.max(1, visual.threshold - 20));
          if (visual.sprite.x > width + 35) visual.sprite.x = -35;
          if (visual.sprite.y > height * 0.86) visual.sprite.y = height * visual.yRatio;
        });

        const visibleParticles = Math.round(240 * current.env.microplastics / 100);
        particles.forEach((particle, index) => {
          particle.shape.visible = index < visibleParticles;
          if (!particle.shape.visible) return;
          particle.shape.x += (particle.speedX + Math.sin(elapsed + particle.phase) * 3) * delta;
          particle.shape.y += particle.speedY * delta;
          particle.shape.rotation += 0.18 * delta;
          if (particle.shape.y > height * 0.88) particle.shape.y = height * 0.08;
          if (particle.shape.x < 0) particle.shape.x = width;
          if (particle.shape.x > width) particle.shape.x = 0;
        });

        const visibleDebris = Math.ceil(6 * current.env.microplastics / 100);
        debris.forEach((item, index) => {
          item.sprite.visible = index < visibleDebris;
          if (!item.sprite.visible) return;
          item.sprite.x += (item.speedX + Math.sin(elapsed + item.phase) * 2) * delta;
          item.sprite.y += item.speedY * delta;
          item.sprite.rotation = Math.sin(elapsed * 0.3 + item.phase) * 0.12;
          if (item.sprite.y > height * 0.8) item.sprite.y = height * 0.12;
          if (item.sprite.x < 0) item.sprite.x = width;
          if (item.sprite.x > width) item.sprite.x = 0;
        });

        const oilLevel = current.env.oil / 100;
        const turbidity = current.env.turbidity / 100;
        const sewage = current.env.sewage / 100;

        // O topo da cena respira: ondas e cáusticas deslizam sem emenda.
        surfaceWaves.x = -((elapsed * 18) % width);
        caustics.x = -((elapsed * 8) % width);
        caustics.alpha = 0.5 + Math.sin(elapsed * 0.5) * 0.26;
        light.alpha =
          (1 - 0.7 * oilLevel) * (0.78 + Math.sin(elapsed * 0.32) * 0.22) * (1 - turbidity * 0.6);

        sedimentHaze.alpha = 0.32 * turbidity;
        sewageHaze.alpha = 0.2 * sewage;
        waterTint.alpha = 0.34 * oilLevel + 0.07 * (current.env.microplastics / 100);
        oilSurface.alpha = 0.74 * oilLevel;
        oilSheen.alpha = 0.68 * oilLevel;

        snow.forEach((flake) => {
          flake.dot.x += (flake.speedX + Math.sin(elapsed * 0.6 + flake.phase) * 2.4) * delta;
          flake.dot.y += flake.speedY * delta;
          if (flake.dot.y > height * 0.98) flake.dot.y = height * 0.02;
          if (flake.dot.x < -4) flake.dot.x = width + 4;
          if (flake.dot.x > width + 4) flake.dot.x = -4;
        });

        const visibleOrganic = Math.round(organic.length * sewage);
        organic.forEach((blob, index) => {
          blob.blob.visible = index < visibleOrganic;
          if (!blob.blob.visible) return;
          blob.blob.x += (blob.speedX + Math.sin(elapsed * 0.8 + blob.phase) * 3) * delta;
          blob.blob.y += blob.speedY * delta;
          if (blob.blob.y > height * 0.96) blob.blob.y = height * 0.04;
          if (blob.blob.x < -5) blob.blob.x = width + 5;
          if (blob.blob.x > width + 5) blob.blob.x = -5;
        });
      });
    };

    void start().catch((error: unknown) => {
      console.error('Não foi possível carregar a cena marinha.', error);
      host.dataset.loadError = 'true';
    });

    return () => {
      disposed = true;
      observer?.disconnect();
      if (app) {
        app.destroy(true, { children: true });
        app = null;
      }
      waterGradient?.destroy();
      waterGradient = null;
      host.replaceChildren();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="marine-canvas"
      role="img"
      aria-label={`Recife costeiro. Saúde geral ${Math.round(state.overall)}%, corais ${Math.round(state.health.coral)}% e peixes ${Math.round(state.health.fish)}%.`}
    />
  );
}
