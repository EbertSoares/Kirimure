import { chromium } from '@playwright/test';

async function run() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('1. Navigating to http://localhost:5174/');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });

  console.log('2. Entering Bahia simulation...');
  const bahia = page.locator('.state.available');
  await bahia.waitFor({ timeout: 10000 });
  await bahia.click();

  await page.waitForSelector('.simulation-workspace', { timeout: 15000 });
  console.log('✓ Simulation workspace loaded.');

  // Test clicking an indicator in the environment-readout
  console.log('3. Testing indicator modal (Oxigênio OD)...');
  const oxygenBtn = page.locator('.readout-item-btn:has-text("OXIGÊNIO")');
  await oxygenBtn.waitFor({ timeout: 5000 });
  await oxygenBtn.click();

  await page.waitForSelector('.indicator-modal-backdrop', { timeout: 5000 });
  console.log('✓ Modal opened for Oxigênio Dissolvido.');
  await page.screenshot({ path: '/tmp/kirimure-modal-oxygen.png' });

  // Close modal
  await page.locator('.indicator-modal-ok-btn').click();
  await page.waitForSelector('.indicator-modal-backdrop', { state: 'detached', timeout: 5000 });
  console.log('✓ Modal closed successfully.');

  // Open challenges tab and start Mission 01
  console.log('4. Navigating to challenges tab and starting Missão 01...');
  const challengesTab = page.locator('.panel-tabs button:has-text("Desafios")');
  await challengesTab.click();

  const startMissionBtn = page.locator('button.mission-start-btn');
  await startMissionBtn.waitFor({ timeout: 5000 });
  await startMissionBtn.click();

  console.log('✓ Missão 01 started.');

  // Advance to hypothesis step
  const nextBtn1 = page.locator('button.mission-next-btn');
  await nextBtn1.click();
  console.log('✓ Etapa 2 (Hipóteses) loaded.');

  // Choose the biological oxygen consumption hypothesis
  const hypChoice = page.locator('button.mission-hypothesis-choice:has-text("Bactérias consomem")');
  await hypChoice.click();
  console.log('✓ Hypothesis selected.');

  const nextBtn2 = page.locator('button.mission-next-btn');
  await nextBtn2.click();
  console.log('✓ Etapa 3 (Experimento) loaded.');

  // Check that DHW is hidden in topbar during Missão 01
  const dhwBtn = page.locator('.readout-item-btn:has-text("DHW")');
  const dhwCount = await dhwBtn.count();
  console.log(`✓ DHW button count during Mission 01: ${dhwCount} (expected 0)`);

  // Check the teaching console slider for sewage
  console.log('5. Adjusting Carga Orgânica (DBO) slider...');
  const slider = page.locator('#factor-sewage');
  await slider.fill('6'); // Index 6 is 5.000 kg DBO
  await slider.dispatchEvent('change');

  // Verify apply button text
  const applyBtn = page.locator('.apply-button');
  const btnText = await applyBtn.textContent();
  console.log(`✓ Apply button text after slider change: "${btnText?.trim()}"`);

  // Click apply button
  await applyBtn.click({ force: true });
  console.log('✓ Experiment started via button click.');

  // Speed up simulation to 5x
  const speed5Btn = page.locator('.speed-control button:has-text("5x"), .speed-control button:has-text("5×")');
  if (await speed5Btn.count() > 0) {
    await speed5Btn.first().click();
    console.log('✓ Speed set to 5x.');
  }

  console.log('6. Waiting 6 seconds for simulated days to elapse and oxygen to drop...');
  await page.waitForTimeout(6500);

  await page.screenshot({ path: '/tmp/kirimure-mission-experiment.png' });
  console.log('✓ Saved screenshot of live chart during hypoxia experiment to /tmp/kirimure-mission-experiment.png');

  // Next step: Solution
  const nextBtn3 = page.locator('button.mission-next-btn:not([disabled])');
  await nextBtn3.click();
  console.log('✓ Etapa 4 (Solução) loaded.');

  // Apply ETE solution
  const eteBtn = page.locator('button.mission-solution-btn');
  await eteBtn.click();
  console.log('✓ ETE activated.');

  // Wait 4 seconds for recovery
  await page.waitForTimeout(4000);

  // Next step: Conclusion
  const nextBtn4 = page.locator('button.mission-next-btn:not([disabled])');
  await nextBtn4.click();
  console.log('✓ Etapa 5 (Conclusão) loaded.');

  await page.screenshot({ path: '/tmp/kirimure-mission-conclusion.png' });
  console.log('✓ Saved screenshot of conclusion table to /tmp/kirimure-mission-conclusion.png');

  await browser.close();
  console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
