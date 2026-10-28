import { chromium } from '@playwright/test';

async function main() {
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

  console.log('Opening app...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(2000);

  // Take screenshot at initial load
  await page.screenshot({ path: '/tmp/initial-view.png' });
  console.log('Saved /tmp/initial-view.png');

  // Let's inspect what happens to the scene
  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return {
      canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
      title: document.title,
      indicators: Array.from(document.querySelectorAll('.indicator-button')).map(b => b.textContent?.trim()),
      healthBadge: document.querySelector('.marine-health-overlay')?.textContent?.trim(),
    };
  });
  console.log('Info:', info);
  console.log('Errors:', errors);

  await browser.close();
}

main().catch(console.error);
