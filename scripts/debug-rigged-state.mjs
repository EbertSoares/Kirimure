import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(3000);

  // Inspect meshes directly via Babylon scene in page
  const inspect1 = await page.evaluate(() => {
    // Babylon scenes can be accessed via Engine.LastCreatedScene or canvas
    const canvas = document.querySelector('canvas');
    // Find babylon scene
    // @ts-ignore
    const engine = window.BABYLON?.Engine?.LastCreatedScene?.getEngine() || null;
    return {
      hasWindowBabylon: !!window.BABYLON,
      canvas: !!canvas,
    };
  });
  console.log('Inspect 1:', inspect1);

  await browser.close();
}

main().catch(console.error);
