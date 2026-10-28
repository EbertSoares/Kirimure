import { chromium } from '@playwright/test';

async function testWebGL2() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  
  // Disable navigator.gpu to force WebGL2 fallback
  await context.addInitScript(() => {
    // @ts-ignore
    delete navigator.gpu;
    // @ts-ignore
    delete Object.getPrototypeOf(navigator).gpu;
  });

  const page = await context.newPage();

  const errors = [];
  const logs = [];
  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  console.log('Navigating with WebGPU DISABLED (forcing WebGL2)...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(3000);

  const sceneInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const marineCanvas = document.querySelector('.marine-canvas');
    const loading = document.querySelector('.scene-loading');
    return {
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
      backend: marineCanvas?.getAttribute('data-renderer'),
      loading: loading?.textContent,
    };
  });

  console.log('WebGL2 Scene Info:', sceneInfo);
  console.log('WebGL2 Errors (' + errors.length + '):', errors);
  console.log('WebGL2 Logs:', logs.slice(-15));

  await page.screenshot({ path: '/tmp/debug-webgl2.png' });
  console.log('Saved /tmp/debug-webgl2.png');

  await browser.close();
}

testWebGL2().catch(console.error);
