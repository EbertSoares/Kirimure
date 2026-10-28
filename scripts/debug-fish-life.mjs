import { chromium } from '@playwright/test';

async function test() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(2000);

  // Monitor fish in the runtime for 20 seconds
  for (let second = 0; second < 20; second += 2) {
    const status = await page.evaluate(() => {
      // Access Babylon runtime through any exposed or dom properties
      const canvas = document.querySelector('canvas');
      return {
        canvasWidth: canvas?.width,
        canvasHeight: canvas?.height,
      };
    });
    console.log(`T+${second}s:`, status);
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: '/tmp/debug-fish-20s.png' });
  console.log('Saved /tmp/debug-fish-20s.png');
  console.log('Errors:', errors);

  await browser.close();
}

test().catch(console.error);
