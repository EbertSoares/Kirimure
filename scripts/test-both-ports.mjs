import { chromium } from '@playwright/test';

async function testPort(port) {
  console.log(`\n=== TESTING PORT ${port} ===`);
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  const warnings = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
    if (msg.type() === 'warning') warnings.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('requestfailed', (req) => failedRequests.push(`${req.url()} (${req.failure()?.errorText})`));

  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(3000);

  const evalResult = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const runtime = window.__kirimureRuntime;
    return {
      canvas: !!canvas,
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
      hasRuntime: !!runtime,
      fishesCount: runtime?.fishes?.length,
      fishesAlive: runtime?.fishes?.filter(f => f.deathStage === 'alive')?.length,
      cameraProfile: document.querySelector('.marine-canvas')?.getAttribute('data-camera-profile'),
      backend: runtime?.backend,
      activeMeshesCount: runtime?.scene?.getActiveMeshes()?.length,
      totalMeshesCount: runtime?.scene?.meshes?.length,
    };
  });

  console.log('Result for port', port, ':', evalResult);
  console.log('Errors:', errors);
  console.log('Warnings:', warnings);
  console.log('Failed Requests:', failedRequests);

  await page.screenshot({ path: `/tmp/port-${port}.png` });
  console.log(`Saved /tmp/port-${port}.png`);

  await browser.close();
}

async function main() {
  await testPort(5173);
  await testPort(5174);
}

main().catch(console.error);
