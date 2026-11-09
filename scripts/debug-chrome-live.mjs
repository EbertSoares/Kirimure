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
      cameraProfile: document.querySelector('.marine-canvas')?.getAttribute('data-camera-profile'),
      fishCount: runtime?.fishes?.length,
      firstFish: runtime?.fishes?.[0] ? {
        species: runtime.fishes[0].species,
        u: runtime.fishes[0].u,
        v: runtime.fishes[0].v,
        depth: runtime.fishes[0].depth,
        elevation: runtime.fishes[0].elevation,
        health: runtime.fishes[0].health,
        deathStage: runtime.fishes[0].deathStage,
      } : null,
    };
  });

  console.log('DEBUG RUNTIME IN CHROME:', JSON.stringify(debug, null, 2));
  console.log('Errors:', errors);
  console.log('Logs:', logs);

  await browser.close();
}

main().catch(console.error);
