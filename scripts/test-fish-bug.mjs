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

  // 1. Move sewage slider to index 15 (50,000 kg DBO)
  console.log('Adjusting sewage slider to max...');
  const sewageInput = page.locator('#factor-sewage');
  await sewageInput.fill('15');
  await sewageInput.dispatchEvent('input');
  await sewageInput.dispatchEvent('change');
  await page.waitForTimeout(500);

  // Click Apply
  console.log('Applying changes...');
  await page.locator('.apply-button').click({ force: true });
  await page.waitForTimeout(500);

  // Unpause
  console.log('Unpausing simulation...');
  const pauseBtn = page.locator('.pause-button');
  const btnText = await pauseBtn.textContent();
  if (btnText?.includes('Continuar')) {
    await pauseBtn.click();
  }

  // Set 10x speed
  console.log('Setting 10x speed...');
  await page.locator('.speed-control button', { hasText: '10x' }).click();

  // Run for 14 seconds real time (140 simulated days at 10x)
  console.log('Waiting 14 seconds real time for simulation to advance...');
  await page.waitForTimeout(14000);

  await page.screenshot({ path: '/tmp/test-after-extreme.png' });
  console.log('Saved /tmp/test-after-extreme.png');

  // Check fish count in DOM or health
  const status = await page.evaluate(() => {
    const healthEls = Array.from(document.querySelectorAll('.health-overlay strong')).map(el => el.textContent?.trim());
    const readouts = Array.from(document.querySelectorAll('.readout-item-btn strong')).map(el => el.textContent?.trim());
    return { healthEls, readouts };
  });
  console.log('Status after pollution:', status);

  // Now click Reiniciar
  console.log('Clicking Reiniciar button...');
  await page.locator('.reset-button').click();
  await page.waitForTimeout(1000);

  // Unpause again if paused
  const btnText2 = await pauseBtn.textContent();
  if (btnText2?.includes('Continuar')) {
    console.log('Unpausing after reset...');
    await pauseBtn.click();
  }
  await page.waitForTimeout(4000);

  await page.screenshot({ path: '/tmp/test-after-reset.png' });
  console.log('Saved /tmp/test-after-reset.png');

  const statusAfterReset = await page.evaluate(() => {
    const healthEls = Array.from(document.querySelectorAll('.health-overlay strong')).map(el => el.textContent?.trim());
    const readouts = Array.from(document.querySelectorAll('.readout-item-btn strong')).map(el => el.textContent?.trim());
    return { healthEls, readouts };
  });
  console.log('Status after reset:', statusAfterReset);

  await browser.close();
}

main().catch(console.error);
