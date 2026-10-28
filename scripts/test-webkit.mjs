import { webkit } from '@playwright/test';

async function testWebKit() {
  try {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const errors = [];
    const logs = [];
    page.on('console', (msg) => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    console.log('Navigating in WebKit (Safari engine)...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.locator('.state.available').click();
    await page.waitForTimeout(4000);

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

    console.log('WebKit Scene Info:', sceneInfo);
    console.log('WebKit Errors (' + errors.length + '):', errors);
    console.log('WebKit Logs:', logs);

    await page.screenshot({ path: '/tmp/debug-webkit.png' });
    console.log('Saved /tmp/debug-webkit.png');

    await browser.close();
  } catch (err) {
    console.error('WebKit test failed:', err);
  }
}

testWebKit();
