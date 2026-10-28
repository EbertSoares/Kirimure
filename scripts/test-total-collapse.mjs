import { chromium } from '@playwright/test';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForTimeout(2000);

  // Set sewage to max (16)
  await page.locator('#factor-sewage').fill('16');
  await page.locator('#factor-sewage').dispatchEvent('input');
  await page.locator('#factor-sewage').dispatchEvent('change');

  // Set oil to max (16)
  await page.locator('#factor-oil').fill('16');
  await page.locator('#factor-oil').dispatchEvent('input');
  await page.locator('#factor-oil').dispatchEvent('change');

  // Apply
  await page.locator('.apply-button').click({ force: true });
  await page.waitForTimeout(500);

  // Unpause
  const pauseBtn = page.locator('.pause-button');
  const btnText = await pauseBtn.textContent();
  if (btnText?.includes('Continuar')) {
    await pauseBtn.click();
  }

  // 10x
  await page.locator('.speed-control button', { hasText: '10x' }).click();

  // Wait 25 seconds (250 simulated days)
  console.log('Waiting 25 seconds for total ecosystem collapse...');
  await page.waitForTimeout(25000);

  await page.screenshot({ path: '/tmp/test-total-collapse.png' });
  console.log('Saved /tmp/test-total-collapse.png');

  // Now click Reiniciar
  console.log('Clicking Reiniciar button...');
  await page.locator('.reset-button').click();
  await page.waitForTimeout(1000);

  // Unpause again if paused
  const btnText2 = await pauseBtn.textContent();
  if (btnText2?.includes('Continuar')) {
    await pauseBtn.click();
  }
  await page.waitForTimeout(5000);

  await page.screenshot({ path: '/tmp/test-reset-after-collapse.png' });
  console.log('Saved /tmp/test-reset-after-collapse.png');

  await browser.close();
}

main().catch(console.error);
