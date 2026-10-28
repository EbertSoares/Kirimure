import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  const logs = [];
  page.on('console', msg => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(4000);

  const debug = await page.evaluate(() => {
    const runtime = window.__kirimureRuntime;
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2');
    const bjsBackend = document.querySelector('.marine-canvas')?.getAttribute('data-renderer');
    return {
      bjsBackend,
      activeCamera: runtime?.scene?.activeCamera?.name,
      cameraPos: runtime?.scene?.activeCamera?.position,
      cameraTarget: runtime?.scene?.activeCamera?.getTarget?.(),
      backdropEnabled: runtime?.backdrop?.mesh?.isEnabled(),
      backdropVisibility: runtime?.backdrop?.mesh?.visibility,
      backdropPos: runtime?.backdrop?.mesh?.position,
      fishCount: runtime?.fishes?.length,
      firstFish: runtime?.fishes?.[0] ? {
        screenX: runtime.fishes[0].currentScreenX,
        screenY: runtime.fishes[0].currentScreenY,
        depth: runtime.fishes[0].currentDepth,
        pos: runtime.fishes[0].holder?.position,
        healthyEnabled: runtime.fishes[0].healthy?.mesh?.isEnabled(),
        healthyVis: runtime.fishes[0].healthy?.mesh?.visibility,
        healthyMatEmissive: runtime.fishes[0].healthy?.material?.emissiveColor,
      } : null,
    };
  });

  console.log('DEBUG RUNTIME IN CHROME:', JSON.stringify(debug, null, 2));
  console.log('Errors:', errors);
  console.log('Logs:', logs);

  await browser.close();
}

main().catch(console.error);
