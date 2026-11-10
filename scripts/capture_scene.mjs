import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

/**
 * Captura de validação visual da cena 3D (desktop ou --mobile).
 *
 * Requer um servidor de desenvolvimento rodando em http://localhost:5199
 * (ex.: `npx vite --port 5199`). O navegador é resolvido na seguinte ordem:
 * 1. Chromium empacotado do Playwright (quando instalado);
 * 2. Google Chrome instalado no sistema (macOS/Windows/Linux);
 * 3. Microsoft Edge (Windows);
 * 4. Binários Chromium de sistema (Linux).
 *
 * Uso:
 *   node scripts/capture_scene.mjs [--mobile] [--output ./captures/cena.png]
 */

function resolveExecutable() {
  try {
    if (existsSync(chromium.executablePath())) return {};
  } catch {
    // Chromium empacotado do Playwright não instalado — segue para os canais nativos.
  }

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return { executablePath: candidate };
  }
  return {};
}

async function run() {
  const args = process.argv.slice(2);
  const mobile = args.includes('--mobile');
  const outputIndex = args.indexOf('--output');
  const outputArg = outputIndex >= 0 ? args[outputIndex + 1] : null;
  const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  const captureDir = resolve('captures');
  mkdirSync(captureDir, { recursive: true });

  console.log('Launching headless Chrome with WebGL/WebGPU...');
  const browser = await chromium.launch({
    headless: true,
    ...resolveExecutable(),
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--no-sandbox',
    ],
  });

  const page = await browser.newPage({ viewport });

  page.on('console', (msg) => {
    console.log(`[Browser Console ${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', (err) => {
    console.error('[Browser Error]:', err);
  });

  console.log('Navigating to http://localhost:5199/...');
  await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  await page.waitForTimeout(1000);

  console.log('Triggering Bahia click in BrazilMapScreen...');
  const clicked = await page.evaluate(() => {
    const el = document.querySelector('g.state.available');
    if (el) {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    }
    return false;
  });
  console.log('Click dispatched:', clicked);

  console.log('Waiting for marine-canvas...');
  await page.waitForSelector('.marine-canvas canvas', { state: 'attached', timeout: 15000 });

  console.log('Waiting 8s for 3D diorama, FBX boat, shaders and shadows to render...');
  await page.waitForTimeout(8000);

  const screenshotPath = outputArg
    ? resolve(outputArg)
    : resolve(captureDir, `scene${mobile ? '-mobile' : '-desktop'}.png`);
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  if (!mobile) {
    const zoomPath = resolve(captureDir, 'zoom-barco.png');
    await page.screenshot({
      path: zoomPath,
      clip: { x: 100, y: 100, width: 650, height: 350 },
    });
    console.log('Zoomed boat screenshot saved to:', zoomPath);
  }

  // Print telemetry
  try {
    const telemetry = await page.evaluate(() => {
      const w = window;
      const runtime = w.__kirimureRuntime;
      if (!runtime) return null;
      if (typeof runtime.getDiagnostics === 'function') return runtime.getDiagnostics();
      if (runtime.scene && typeof runtime.scene.getDiagnostics === 'function') return runtime.scene.getDiagnostics();
      return null;
    });
    if (telemetry) {
      console.log('Telemetry:', JSON.stringify(telemetry, null, 2));
    }
  } catch (e) {
    console.log('Telemetry not available:', e.message);
  }

  await browser.close();
  console.log('Done.');
}

run().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
