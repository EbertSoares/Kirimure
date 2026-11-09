import { webkit } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:8080/';

const browser = await webkit.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const errors = [];
const warnings = [];
const failures = [];
const logs = [];

page.on('console', (msg) => {
  const line = `[${msg.type()}] ${msg.text()}`;
  logs.push(line);
  if (msg.type() === 'error') errors.push(line);
  if (msg.type() === 'warning') warnings.push(line);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}\n${err.stack}`));
page.on('requestfailed', (req) => failures.push(`${req.url()} (${req.failure()?.errorText})`));

await page.goto(url, { waitUntil: 'networkidle' });
const mapState = await page.evaluate(() => ({
  hasOldSelector: Boolean(document.querySelector('.state.available')),
  buttons: [...document.querySelectorAll('[role="button"],button')].map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim()).filter(Boolean).slice(0, 30),
}));

const selector = mapState.hasOldSelector ? '.state.available' : '[aria-label*="Bahia"]';
try {
  await page.locator(selector).first().click({ timeout: 5000 });
} catch (error) {
  errors.push(`[click] ${error.message}`);
}

await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/kirimure-webkit.png', fullPage: false });

const result = await page.evaluate(() => {
  const rt = window.__kirimureRuntime;
  const canvas = document.querySelector('canvas');
  const marine = document.querySelector('.marine-canvas');
  if (!rt) {
    return {
      runtime: false,
      loading: document.querySelector('.scene-loading')?.textContent,
      canvas: canvas ? { width: canvas.width, height: canvas.height, rect: canvas.getBoundingClientRect().toJSON() } : null,
      renderer: marine?.getAttribute('data-renderer'),
      gpu: 'gpu' in navigator,
    };
  }
  const fish0 = rt.fishes?.[0];
  return {
    runtime: true,
    backend: rt.backend,
    engine: rt.engine?.constructor?.name,
    gpu: 'gpu' in navigator,
    loading: document.querySelector('.scene-loading')?.textContent ?? null,
    renderer: marine?.getAttribute('data-renderer'),
    cameraProfile: marine?.getAttribute('data-camera-profile'),
    canvas: canvas ? {
      width: canvas.width,
      height: canvas.height,
      rect: canvas.getBoundingClientRect().toJSON(),
      hasWebGL2: Boolean(canvas.getContext('webgl2')),
    } : null,
    renderSize: rt.engine ? [rt.engine.getRenderWidth(true), rt.engine.getRenderHeight(true)] : null,
    scene: {
      meshes: rt.scene?.meshes?.length,
      activeMeshes: rt.scene?.getActiveMeshes?.()?.length,
      camera: rt.scene?.activeCamera?.name,
      meshesInFrustum: rt.scene?.meshes?.filter((mesh) => mesh.isEnabled() && mesh.isInFrustum?.(rt.scene.frustumPlanes)).length,
    },
    fishCount: rt.fishes?.length,
    fish0: fish0 ? {
      species: fish0.species,
      health: fish0.health,
      deathStage: fish0.deathStage,
      u: fish0.u,
      v: fish0.v,
      depth: fish0.depth,
      elevation: fish0.elevation,
    } : null,
  };
});

console.log(JSON.stringify({ url, mapState, selector, result, errors, warnings, failures, logs: logs.slice(-40) }, null, 2));
await browser.close();
