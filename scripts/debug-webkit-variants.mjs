import { webkit } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:8080/';

async function runVariant(browser, name, options) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: options.deviceScaleFactor ?? 2,
  });
  if (options.noWebGpu) {
    await context.addInitScript(() => {
      delete navigator.gpu;
      delete Object.getPrototypeOf(navigator).gpu;
    });
  }
  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `/tmp/kirimure-webkit-${name}.png` });

  const state = await page.evaluate(() => {
    const rt = window.__kirimureRuntime;
    const canvas = document.querySelector('canvas');
    const marine = document.querySelector('.marine-canvas');
    if (!rt) {
      return {
        runtime: false,
        loading: document.querySelector('.scene-loading')?.textContent,
        canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
        renderer: marine?.getAttribute('data-renderer'),
      };
    }
    const alive = rt.fishes?.filter((f) => f.deathStage === 'alive').length;
    return {
      runtime: true,
      backend: rt.backend,
      engine: rt.engine?.constructor?.name,
      loading: document.querySelector('.scene-loading')?.textContent ?? null,
      canvas: canvas ? { width: canvas.width, height: canvas.height, dpr: window.devicePixelRatio } : null,
      renderSize: rt.engine ? [rt.engine.getRenderWidth(true), rt.engine.getRenderHeight(true)] : null,
      fishCount: rt.fishes?.length,
      fishAlive: alive,
      backendAttr: marine?.getAttribute('data-renderer'),
      cameraProfile: marine?.getAttribute('data-camera-profile'),
    };
  });

  await context.close();
  return {
    name,
    options,
    state,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)].slice(0, 8),
    warningCount: warnings.length,
  };
}

const browser = await webkit.launch({ headless: true });
const results = [];
results.push(await runVariant(browser, 'webgpu-dpr2', {}));
results.push(await runVariant(browser, 'webgpu-dpr1', { deviceScaleFactor: 1 }));
results.push(await runVariant(browser, 'webgl2-dpr2', { noWebGpu: true }));
results.push(await runVariant(browser, 'webgl2-dpr1', { noWebGpu: true, deviceScaleFactor: 1 }));
console.log(JSON.stringify(results, null, 2));
await browser.close();
