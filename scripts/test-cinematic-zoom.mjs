import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/ebertsoares/.gemini/antigravity/brain/5d3d1ee3-8dda-4bac-a047-9bd0e4c783c0';

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--enable-webgl', '--ignore-gpu-blocklist']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  console.log('Navigating to http://localhost:5173/ ...');
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // 1. Initial Map View
  console.log('1. Waiting for Brazil map screen...');
  await page.waitForSelector('.brazil-map-svg');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'zoom-calm-1-initial.png') });
  console.log('Captured zoom-calm-1-initial.png');

  // 2. Click Bahia
  console.log('2. Clicking Bahia to trigger calm zoom & faster darkening...');
  const bahia = await page.waitForSelector('.state.available');
  await bahia.click();

  // 2.1 Early progress (~400ms)
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'zoom-calm-2-flight-and-darkening.png') });
  console.log('Captured zoom-calm-2-flight-and-darkening.png');

  // 2.2 Advanced darkening (~900ms)
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'zoom-calm-3-fast-darkening.png') });
  console.log('Captured zoom-calm-3-fast-darkening.png');

  // 2.3 Ready in 3D simulation (~1900ms)
  console.log('Waiting for simulation app to mount and veil to clear...');
  await page.waitForSelector('.simulation-app');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'zoom-calm-4-3d-ready.png') });
  console.log('Captured zoom-calm-4-3d-ready.png');

  // 3. Click back to map
  console.log('3. Clicking ← Mapa button...');
  const backBtn = await page.waitForSelector('.map-back-button');
  await backBtn.click();

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'zoom-calm-5-returned.png') });
  console.log('Captured zoom-calm-5-returned.png');

  await browser.close();
  console.log('All tests completed successfully!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
