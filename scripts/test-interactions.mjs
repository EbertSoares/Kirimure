import { chromium } from '@playwright/test';

async function testInteractions() {
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

  console.log('1. Testing Sector Change to Paraguacu...');
  await page.locator('#topbar-sector-select').selectOption('paraguacu');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/test-sector-paraguacu.png' });

  console.log('2. Testing Sector Change to Barra...');
  await page.locator('#topbar-sector-select').selectOption('barra');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/test-sector-barra.png' });

  console.log('3. Testing Reset button...');
  await page.locator('button.reset-button').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/test-after-reset.png' });

  console.log('4. Testing Tab switches...');
  for (const tab of ['Indicadores', 'Espécies', 'Histórico', 'Desafios', 'Agora']) {
    await page.locator(`.panel-tabs button:has-text("${tab}")`).click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: '/tmp/test-after-tabs.png' });

  console.log('5. Testing Sliders to extreme (oil, sewage, microplastics)...');
  await page.locator('#factor-oil').fill('8');
  await page.locator('#factor-oil').dispatchEvent('change');
  await page.locator('#factor-sewage').fill('8');
  await page.locator('#factor-sewage').dispatchEvent('change');
  await page.locator('button.apply-button').click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/test-after-extreme.png' });

  console.log('Errors:', errors);
  await browser.close();
}

testInteractions().catch(console.error);
