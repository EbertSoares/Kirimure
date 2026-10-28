import { chromium } from '@playwright/test';

async function testMobile() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(3000);

  const sceneInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return {
      canvasWidth: canvas?.width,
      canvasHeight: canvas?.height,
      clientWidth: canvas?.clientWidth,
      clientHeight: canvas?.clientHeight,
    };
  });

  console.log('Mobile Scene Info:', sceneInfo);
  await page.screenshot({ path: '/tmp/debug-mobile.png' });
  console.log('Saved /tmp/debug-mobile.png');

  await browser.close();
}

testMobile().catch(console.error);
