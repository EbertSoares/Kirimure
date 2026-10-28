import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = '/Users/ebertsoares/.gemini/antigravity/brain/5d3d1ee3-8dda-4bac-a047-9bd0e4c783c0';

async function main() {
  console.log('Testing Scientific Menus (Indicadores & Espécies)...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // 1. Enter Bahia
  console.log('Entering Bahia...');
  await page.locator('.state.available').click();
  await page.waitForSelector('.simulation-app');
  await page.waitForTimeout(1600);

  // Unpause & run at 3x for 4 seconds to build historical sparkline points
  console.log('Advancing time to generate historical data...');
  await page.evaluate(() => {
    const pauseBtn = document.querySelector('.pause-button');
    if (pauseBtn && pauseBtn.textContent?.includes('Continuar')) {
      pauseBtn.click();
    }
    const buttons = Array.from(document.querySelectorAll('.speed-control button'));
    const btn3x = buttons.find(b => b.textContent?.includes('3x'));
    if (btn3x) btn3x.click();
  });
  await page.waitForTimeout(4000);

  // 2. Click "Indicadores" tab
  console.log('Switching to Indicadores tab...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.panel-tabs button'));
    const indTab = tabs.find(t => t.textContent?.includes('Indicadores'));
    if (indTab) indTab.click();
  });
  await page.waitForTimeout(600);

  // Verify Radar & Gauges
  const radarExists = await page.locator('.ecosystem-radar-card').isVisible();
  const sparklinesCount = await page.locator('.sparkline-svg').count();
  const gaugesCount = await page.locator('.normative-gauge').count();
  console.log(`Indicadores Tab -> Radar: ${radarExists}, Sparklines: ${sparklinesCount}, Gauges: ${gaugesCount}`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'science-indicators-tab.png') });
  console.log('Captured science-indicators-tab.png');

  // 3. Click "Espécies" tab
  console.log('Switching to Espécies tab...');
  await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.panel-tabs button'));
    const espTab = tabs.find(t => t.textContent?.includes('Espécies'));
    if (espTab) espTab.click();
  });
  await page.waitForTimeout(600);

  // Verify Pyramid & Niche Curves
  const pyramidExists = await page.locator('.trophic-pyramid-card').isVisible();
  const nicheCurvesCount = await page.locator('.niche-curve-container').count();
  const binomialTagsCount = await page.locator('.species-binomial').count();
  console.log(`Espécies Tab -> Pyramid: ${pyramidExists}, Niche Curves: ${nicheCurvesCount}, Binomial Tags: ${binomialTagsCount}`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'science-species-tab.png') });
  console.log('Captured science-species-tab.png');

  await browser.close();
  console.log('Scientific Menus Test Completed Successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
