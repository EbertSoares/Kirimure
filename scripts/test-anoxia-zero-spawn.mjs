import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = '/Users/ebertsoares/.gemini/antigravity/brain/5d3d1ee3-8dda-4bac-a047-9bd0e4c783c0';

async function main() {
  console.log('Launching Chrome for Anoxia & Zero-Spawn Test...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // 1. Enter Bahia simulation
  console.log('Clicking Bahia...');
  await page.locator('.state.available').click();
  await page.waitForSelector('.simulation-app');
  await page.waitForTimeout(1600);

  // 2. Dump 100t Sewage (DBO)
  console.log('Injecting 100t sewage (DBO)...');
  await page.evaluate(() => {
    // Show all factors if hidden
    const seeAllBtn = document.querySelector('.console-toggle-btn');
    if (seeAllBtn) seeAllBtn.click();
  });
  await page.waitForTimeout(300);

  // Adjust sewage slider to max 100000 (100t)
  const applied = await page.evaluate(() => {
    const sewageSlider = document.getElementById('factor-sewage');
    if (!sewageSlider) return 'no-slider';

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(sewageSlider, sewageSlider.max);
    } else {
      sewageSlider.value = sewageSlider.max;
    }
    sewageSlider.dispatchEvent(new Event('input', { bubbles: true }));
    sewageSlider.dispatchEvent(new Event('change', { bubbles: true }));

    const applyBtn = document.querySelector('.apply-button');
    if (applyBtn && !applyBtn.disabled) {
      applyBtn.click();
      return 'applied-btn';
    }
    return 'slider-set-no-btn';
  });
  console.log('Applied 100t sewage:', applied);
  await page.waitForTimeout(400);

  // Unpause simulation: click .pause-button ("Continuar")
  console.log('Unpausing simulation...');
  await page.evaluate(() => {
    const pauseBtn = document.querySelector('.pause-button');
    if (pauseBtn && pauseBtn.textContent?.includes('Continuar')) {
      pauseBtn.click();
    }
  });

  // Click 10x speed
  console.log('Selecting 10x speed...');
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.speed-control button'));
    const btn10x = buttons.find(b => b.textContent?.includes('10x'));
    if (btn10x) btn10x.click();
  });

  // Advance time: wait 15 seconds at 10x speed (~120 simulated days)
  console.log('Advancing time to achieve severe anoxia and fauna collapse...');
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const stats = await page.evaluate(() => {
      const runtime = window.__kirimureRuntime;
      if (!runtime) return null;
      const state = runtime.state;
      const livingProc = runtime.fishes?.filter(f => f.deathStage === 'alive').length ?? 0;
      const livingRigged = runtime.riggedFishes3D?.filter(f => f.deathStage === 'alive').length ?? 0;
      const repopProc = runtime.fishes?.filter(f => f.deathStage === 'repopulating').length ?? 0;
      return {
        day: state.elapsedDays,
        oxygen: state.dissolvedOxygen,
        fishHealth: state.health.fish,
        coralHealth: state.health.coral,
        livingProc,
        livingRigged,
        repopProc,
      };
    });
    console.log(`Sec ${i+1}: Day ${stats?.day?.toFixed(1)}, O2: ${stats?.oxygen?.toFixed(2)} mg/L, Fish Health: ${stats?.fishHealth?.toFixed(1)}%, Living Fish: ${stats ? stats.livingProc + stats.livingRigged : 0}`);
  }

  // Check over 5 seconds: does ANY fish respawn?
  console.log('Verifying that ZERO fish respawn during persistent anoxia...');
  let anySpawned = false;
  for (let s = 0; s < 5; s++) {
    await page.waitForTimeout(1000);
    const living = await page.evaluate(() => {
      const runtime = window.__kirimureRuntime;
      const livingProc = runtime?.fishes?.filter(f => f.deathStage === 'alive').length ?? 0;
      const livingRigged = runtime?.riggedFishes3D?.filter(f => f.deathStage === 'alive').length ?? 0;
      return livingProc + livingRigged;
    });
    if (living > 0) {
      console.error(`BUG DETECTED! ${living} fish spawned while water is collapsed!`);
      anySpawned = true;
    }
  }

  const finalStats = await page.evaluate(() => {
    const runtime = window.__kirimureRuntime;
    return {
      day: runtime?.state.elapsedDays,
      oxygen: runtime?.state.dissolvedOxygen,
      fishHealth: runtime?.state.health.fish,
      livingProc: runtime?.fishes?.filter(f => f.deathStage === 'alive').length,
      livingRigged: runtime?.riggedFishes3D?.filter(f => f.deathStage === 'alive').length,
    };
  });

  console.log('Final State:', finalStats);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test-anoxia-zero-spawn.png') });
  console.log('Captured test-anoxia-zero-spawn.png');

  await browser.close();

  if (anySpawned || (finalStats.livingProc ?? 0) + (finalStats.livingRigged ?? 0) > 0) {
    console.error('FAILED: Fish spawned during anoxia!');
    process.exit(1);
  } else {
    console.log('PASSED: Exactly 0 fish spawned during anoxia! Biological rigor verified.');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
