import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import type { SimulationState } from '../simulation/types';

interface MarineSceneProps {
  state: SimulationState;
}

interface FishVisual {
  root: Container;
  body: Graphics;
  speed: number;
  phase: number;
  threshold: number;
  direction: 1 | -1;
}

interface ParticleVisual {
  shape: Graphics;
  speedX: number;
  speedY: number;
  phase: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function mixColor(from: number, to: number, amount: number) {
  const start = [(from >> 16) & 255, (from >> 8) & 255, from & 255];
  const end = [(to >> 16) & 255, (to >> 8) & 255, to & 255];
  const mixed = start.map((channel, index) => Math.round(channel + (end[index] - channel) * amount));
  return (mixed[0] << 16) + (mixed[1] << 8) + mixed[2];
}

function createFish(index: number): FishVisual {
  const root = new Container();
  const body = new Graphics();
  const palette = [0xffcb45, 0x46bbed, 0x8fe16c, 0xff8a55, 0x8369db];
  const color = palette[index % palette.length];

  body.ellipse(0, 0, 17, 9).fill(color);
  body.poly([-16, 0, -28, -10, -26, 10]).fill(index % 2 ? 0x148fc1 : 0xf08b31);
  body.circle(9, -2, 1.7).fill(0x092f4c);
  body.moveTo(-2, -8).lineTo(5, -14).lineTo(8, -7).closePath().fill({ color: 0xffffff, alpha: 0.75 });
  body.moveTo(-3, 8).lineTo(4, 13).lineTo(8, 7).closePath().fill({ color: 0xffffff, alpha: 0.62 });
  root.addChild(body);

  return {
    root,
    body,
    speed: 12 + (index % 5) * 4,
    phase: index * 0.78,
    threshold: 5 + ((index * 37) % 91),
    direction: index % 3 === 0 ? -1 : 1,
  };
}

function drawBackground(graphics: Graphics, width: number, height: number) {
  graphics.clear();
  graphics.rect(0, 0, width, height).fill(0x12bada);
  graphics.rect(0, height * 0.42, width, height * 0.58).fill(0x087da5);
  graphics.rect(0, height * 0.67, width, height * 0.33).fill(0x086683);
  graphics.ellipse(width * 0.5, height * 1.03, width * 0.7, height * 0.24).fill(0xe6c98f);
  graphics.ellipse(width * 0.16, height * 0.86, width * 0.28, height * 0.25).fill(0x315e65);
  graphics.ellipse(width * 0.87, height * 0.88, width * 0.26, height * 0.24).fill(0x31535f);
}

function drawLight(graphics: Graphics, width: number, height: number) {
  graphics.clear();
  const origins = [0.18, 0.36, 0.56, 0.76];
  origins.forEach((origin, index) => {
    graphics
      .poly([
        width * origin,
        0,
        width * (origin + 0.055),
        0,
        width * (origin + 0.16),
        height * 0.62,
        width * (origin - 0.06),
        height * 0.62,
      ])
      .fill({ color: 0xe8ffff, alpha: 0.055 + index * 0.01 });
  });
}

function drawReef(graphics: Graphics, width: number, height: number, coralHealth: number) {
  graphics.clear();
  const random = mulberry32(1229);
  const bleached = 1 - coralHealth / 100;
  const healthyColors = [0xff7a38, 0xffbe42, 0xe94f8b, 0x9b67d9, 0x62cc8b];

  for (let index = 0; index < 54; index += 1) {
    const side = index % 2 === 0 ? random() * 0.31 : 0.69 + random() * 0.31;
    const x = width * side;
    const y = height * (0.72 + random() * 0.25);
    const size = 5 + random() * 16;
    const healthy = healthyColors[index % healthyColors.length];
    const color = mixColor(healthy, index % 3 === 0 ? 0xe7e4d5 : 0xb7b59d, bleached);
    graphics.circle(x, y, size).fill({ color, alpha: 0.93 });
    if (index % 3 === 0) {
      graphics
        .moveTo(x, y)
        .lineTo(x - size * 0.3, y - size * 2.2)
        .moveTo(x, y - size)
        .lineTo(x + size * 0.7, y - size * 2.7)
        .stroke({ color, width: Math.max(3, size * 0.42), cap: 'round' });
    }
  }

  for (let index = 0; index < 18; index += 1) {
    const x = width * (0.04 + random() * 0.92);
    const y = height * (0.88 + random() * 0.1);
    graphics
      .moveTo(x, y)
      .quadraticCurveTo(x - 8, y - 25, x - 2, y - 52 - random() * 18)
      .stroke({ color: 0x75a94c, width: 3 + random() * 3, cap: 'round' });
  }
}

function drawSurface(graphics: Graphics, width: number) {
  graphics.clear();
  graphics.rect(0, 0, width, 22).fill({ color: 0xbaf8ff, alpha: 0.22 });
  for (let index = 0; index < 9; index += 1) {
    const x = (width / 8) * index;
    graphics
      .moveTo(x - 20, 14 + (index % 2) * 4)
      .quadraticCurveTo(x + 15, 3, x + 58, 12)
      .stroke({ color: 0xe8ffff, alpha: 0.45, width: 2.5 });
  }
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

      const background = new Graphics();
      const light = new Graphics();
      const reef = new Graphics();
      const fishLayer = new Container();
      const particlesLayer = new Container();
      const waterTint = new Graphics();
      const warmTint = new Graphics();
      const oilSurface = new Graphics();
      const surface = new Graphics();
      instance.stage.addChild(background, light, fishLayer, reef, particlesLayer, waterTint, warmTint, oilSurface, surface);

      const fish = Array.from({ length: 20 }, (_, index) => {
        const visual = createFish(index);
        fishLayer.addChild(visual.root);
        return visual;
      });

      const random = mulberry32(7021);
      const particles: ParticleVisual[] = Array.from({ length: 150 }, (_, index) => {
        const shape = new Graphics();
        const colors = [0xfdfdfd, 0xffe24a, 0xfb6255, 0x7ae36a, 0x61bffc, 0xd37de4];
        const size = 1.4 + random() * 3.3;
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

      let previousWidth = 0;
      let previousHeight = 0;
      let previousCoralBucket = -1;
      let elapsed = 0;

      instance.ticker.add((ticker) => {
        elapsed += ticker.deltaMS / 1000;
        const width = instance.screen.width;
        const height = instance.screen.height;
        const current = stateRef.current;
        const coralBucket = Math.round(current.health.coral / 3);

        if (width !== previousWidth || height !== previousHeight) {
          previousWidth = width;
          previousHeight = height;
          drawBackground(background, width, height);
          drawLight(light, width, height);
          drawSurface(surface, width);
          waterTint.clear().rect(0, 0, width, height).fill(0x17363d);
          warmTint.clear().rect(0, 0, width, height).fill(0xf36b3a);
          oilSurface.clear().rect(0, 0, width, Math.max(18, height * 0.07)).fill(0x201c18);
          fish.forEach((visual, index) => {
            visual.root.x = width * (0.08 + ((index * 0.137) % 0.84));
            visual.root.y = height * (0.2 + ((index * 0.173) % 0.48));
            const scale = 0.55 + (index % 5) * 0.12;
            visual.root.scale.set(scale * visual.direction, scale);
          });
          particles.forEach((particle) => {
            particle.shape.x = random() * width;
            particle.shape.y = height * (0.12 + random() * 0.7);
          });
        }

        if (coralBucket !== previousCoralBucket || width !== previousWidth) {
          previousCoralBucket = coralBucket;
          drawReef(reef, width, height, current.health.coral);
        }

        const fishHealth = current.health.fish;
        fish.forEach((visual, index) => {
          const alive = fishHealth >= visual.threshold;
          const weak = fishHealth < visual.threshold + 15;
          const delta = ticker.deltaMS / 1000;
          visual.root.x += visual.speed * visual.direction * delta;
          visual.root.y += Math.sin(elapsed * 1.2 + visual.phase) * 0.08;
          visual.body.tint = weak ? 0xaeb8ac : 0xffffff;
          visual.root.rotation = alive ? Math.sin(elapsed + visual.phase) * 0.025 : visual.direction * 1.15;
          visual.root.alpha = alive ? (weak ? 0.62 : 0.92) : clamp(fishHealth / Math.max(visual.threshold, 1)) * 0.32;
          if (!alive) visual.root.y -= 5 * delta;
          if (visual.direction === 1 && visual.root.x > width + 45) visual.root.x = -45;
          if (visual.direction === -1 && visual.root.x < -45) visual.root.x = width + 45;
          if (visual.root.y < height * 0.08) visual.root.y = height * (0.2 + ((index * 0.173) % 0.48));
        });

        const visibleParticles = Math.round(150 * current.env.microplastics / 100);
        particles.forEach((particle, index) => {
          particle.shape.visible = index < visibleParticles;
          if (!particle.shape.visible) return;
          const delta = ticker.deltaMS / 1000;
          particle.shape.x += (particle.speedX + Math.sin(elapsed + particle.phase) * 3) * delta;
          particle.shape.y += particle.speedY * delta;
          particle.shape.rotation += 0.18 * delta;
          if (particle.shape.y > height * 0.88) particle.shape.y = height * 0.08;
          if (particle.shape.x < 0) particle.shape.x = width;
          if (particle.shape.x > width) particle.shape.x = 0;
        });

        light.alpha = 1 - 0.78 * (current.env.oil / 100);
        waterTint.alpha = 0.42 * (current.env.oil / 100) + 0.1 * (current.env.microplastics / 100);
        warmTint.alpha = 0.09 * clamp((current.env.temperature - 29) / 6);
        oilSurface.alpha = 0.72 * (current.env.oil / 100);
      });
    };

    void start();

    return () => {
      disposed = true;
      if (app) {
        app.destroy(true, { children: true });
        app = null;
      }
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
