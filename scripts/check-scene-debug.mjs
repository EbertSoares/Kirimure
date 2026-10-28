import { chromium } from '@playwright/test';

async function test() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  const logs = [];

  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`Page Error: ${err.message}\n${err.stack}`);
  });

  console.log('Navigating to http://localhost:5174/ ...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });

  // Enter Bahia
  console.log('Clicking Bahia...');
  await page.locator('.state.available').click();

  await page.waitForTimeout(3000);

  // Take screenshot of current state
  await page.screenshot({ path: '/tmp/debug-scene-initial.png' });
  console.log('Saved /tmp/debug-scene-initial.png');

  // Check scene elements via page.evaluate
  const sceneInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas found' };
    const marineCanvas = document.querySelector('.marine-canvas');
    const loading = document.querySelector('.scene-loading');

    return {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      canvasStyle: canvas.getAttribute('style'),
      marineCanvasData: {
        renderer: marineCanvas?.getAttribute('data-renderer'),
        buoyancy: marineCanvas?.getAttribute('data-buoyancy'),
        scene: marineCanvas?.getAttribute('data-scene'),
      },
      loadingText: loading?.textContent,
    };
  });

  console.log('Scene Info:', JSON.stringify(sceneInfo, null, 2));
  console.log('Errors (' + errors.length + '):', errors);
  console.log('Logs (' + logs.length + '):', logs.slice(-20));

  await browser.close();
}

test().catch(console.error);
