import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = '/Users/ebertsoares/.gemini/antigravity/brain/5d3d1ee3-8dda-4bac-a047-9bd0e4c783c0';

async function main() {
  console.log('Testing Clean Fish Movement (Zero Particles)...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.locator('.state.available').click();
  await page.waitForSelector('.simulation-app');
  await page.waitForTimeout(1600);

  // Unpause & run for 3 seconds
  await page.evaluate(() => {
    const pauseBtn = document.querySelector('.pause-button');
    if (pauseBtn && pauseBtn.textContent?.includes('Continuar')) {
      pauseBtn.click();
    }
  });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'clean-fish-movement.png') });
  console.log('Captured clean-fish-movement.png');

  await browser.close();
  console.log('Done!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
