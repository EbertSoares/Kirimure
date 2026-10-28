import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = '/tmp/kirimure-qa';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const logs = [];
page.on('console', (m) => { logs.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));

const snap = () => page.evaluate(() => {
  const panel = document.querySelector('.science-panel');
  const panelBody = document.querySelector('.panel-body');
  const consoleEl = document.querySelector('.teaching-console');
  const readout = [...document.querySelectorAll('.environment-readout button')].map((b) => b.innerText.replace(/\n/g, ' '));
  const health = [...document.querySelectorAll('.health-overlay-items button')].map((b) => b.innerText.replace(/\n/g, ' '));
  const mission = document.querySelector('.mission-active-panel');
  const missionNext = [...document.querySelectorAll('.mission-next-btn, .mission-solution-btn')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled, cls: b.className }));
  return {
    panelText: panel?.innerText,
    panelScroll: panelBody ? { top: panelBody.scrollTop, sh: panelBody.scrollHeight, ch: panelBody.clientHeight } : null,
    consoleText: consoleEl?.innerText,
    consoleFactors: [...document.querySelectorAll('.direct-factor')].map((el) => ({ label: el.querySelector('.factor-name')?.textContent, value: el.querySelector('.factor-value')?.textContent, active: el.classList.contains('active') })),
    consoleToggle: [...document.querySelectorAll('.console-toggle-btn')].map((b) => b.textContent.trim()),
    apply: (() => { const b = document.querySelector('.apply-button'); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; })(),
    readout,
    health,
    missionText: mission?.innerText,
    missionNext,
    stateText: document.body.innerText.slice(0, 5000),
    runtime: window.__kirimureRuntime ? {
      backend: window.__kirimureRuntime.backend,
      state: {
        elapsedDays: window.__kirimureRuntime.state.elapsedDays,
        oxygen: window.__kirimureRuntime.state.dissolvedOxygen,
        sewage: window.__kirimureRuntime.state.env.sewage,
        health: window.__kirimureRuntime.state.health,
      },
      fishCount: window.__kirimureRuntime.fishes?.length,
    } : null,
  };
});

async function gotoSim() {
  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  await page.locator('g.state.available').click();
  await page.waitForTimeout(2200);
  await page.getByRole('tab', { name: 'Desafios' }).click();
}

async function setSewage(index) {
  const slider = page.locator('#factor-sewage');
  await slider.focus();
  await slider.press('Home');
  for (let i = 0; i < index; i += 1) await slider.press('ArrowRight');
}

const out = {};

// ---- normal mission path with 5.000 kg ----
await gotoSim();
await page.screenshot({ path: `${OUT}/mission-01-challenges.png` });
await page.getByRole('button', { name: /Iniciar Missão Guiada/ }).click();
await page.waitForTimeout(250);
out.intro = await snap();
await page.screenshot({ path: `${OUT}/mission-02-intro.png` });

await page.getByRole('button', { name: /Formular Previsão/ }).click();
await page.waitForTimeout(200);
out.hypothesisBefore = await snap();
await page.screenshot({ path: `${OUT}/mission-03-hypothesis.png` });
const hypothesisButtons = page.locator('.mission-hypothesis-choice');
out.hypothesisAria = await hypothesisButtons.evaluateAll((els) => els.map((el) => ({ text: el.textContent.trim(), cls: el.className, pressed: el.getAttribute('aria-pressed'), role: el.getAttribute('role') })));
await hypothesisButtons.nth(1).click();
await page.waitForTimeout(100);
out.hypothesisAfter = await snap();
await page.getByRole('button', { name: /Confirmar e Iniciar Experimento/ }).click();
await page.waitForTimeout(200);
out.experiment = await snap();
await page.screenshot({ path: `${OUT}/mission-04-experiment-before.png` });

await setSewage(12);
await page.waitForTimeout(100);
out.beforeApply = await snap();
await page.screenshot({ path: `${OUT}/mission-05-before-apply.png` });
const t0 = Date.now();
await page.locator('.apply-button').click();
out.applyMs = Date.now() - t0;
await page.waitForTimeout(400);
out.afterApply = await snap();
await page.screenshot({ path: `${OUT}/mission-06-after-apply.png` });

// speed 10x and wait for >6 simulated days
await page.locator('.speed-control button', { hasText: '10x' }).click();
await page.waitForTimeout(3500);
out.after6days = await snap();
await page.screenshot({ path: `${OUT}/mission-07-after-6days.png` });

const solutionNext = page.locator('.mission-next-btn', { hasText: /Investigar Solução/ });
out.solutionNextBefore = { count: await solutionNext.count(), disabled: await solutionNext.first().isDisabled().catch(() => null) };
if (await solutionNext.count()) {
  await solutionNext.click();
  await page.waitForTimeout(300);
  out.solution = await snap();
  await page.screenshot({ path: `${OUT}/mission-08-solution.png` });

  await page.getByRole('button', { name: /Ativar Tratamento de Esgoto/ }).click();
  await page.waitForTimeout(300);
  out.solutionApplied = await snap();
  await page.screenshot({ path: `${OUT}/mission-09-solution-applied.png` });

  const conclusionNext = page.locator('.mission-next-btn', { hasText: /Ver Conclusão/ });
  out.conclusionNextBefore = { count: await conclusionNext.count(), disabled: await conclusionNext.first().isDisabled().catch(() => null) };
  if (await conclusionNext.count()) {
    await conclusionNext.click();
    await page.waitForTimeout(300);
    out.conclusion = await snap();
    await page.screenshot({ path: `${OUT}/mission-10-conclusion.png` });

    await page.getByRole('button', { name: /Concluir Missão/ }).click();
    await page.waitForTimeout(300);
    out.afterExit = await snap();
    await page.screenshot({ path: `${OUT}/mission-11-after-exit.png` });
  }
}

// ---- start mission from a degraded state ----
await gotoSim();
await setSewage(16); // 100.000 kg
await page.locator('.apply-button').click();
await page.locator('.speed-control button', { hasText: '10x' }).click();
await page.waitForTimeout(4500);
out.degradedSim = await snap();
await page.screenshot({ path: `${OUT}/mission-degraded-sim.png` });
await page.getByRole('tab', { name: 'Desafios' }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /Iniciar Missão Guiada/ }).click();
await page.waitForTimeout(300);
out.missionFromDegraded = await snap();
await page.screenshot({ path: `${OUT}/mission-degraded-start.png` });

await fs.writeFile(`${OUT}/mission.json`, JSON.stringify({ ...out, errors, logs: logs.slice(-30) }, null, 2));
console.log(JSON.stringify({
  applyMs: out.applyMs,
  intro: { text: out.intro?.missionText?.slice(0, 1000), metric: out.intro?.missionText?.match(/Oxigênio de Partida[^\n]*/)?.[0], factors: out.intro?.consoleFactors },
  beforeApply: { factors: out.beforeApply?.consoleFactors, apply: out.beforeApply?.apply, consoleToggle: out.beforeApply?.consoleToggle },
  afterApply: { factors: out.afterApply?.consoleFactors, apply: out.afterApply?.apply, runtime: out.afterApply?.runtime },
  after6days: { readout: out.after6days?.readout, mission: out.after6days?.missionText?.slice(0, 1500), runtime: out.after6days?.runtime, next: out.after6days?.missionNext },
  solutionNextBefore: out.solutionNextBefore,
  solution: out.solution?.missionText?.slice(0, 1200),
  solutionApplied: { mission: out.solutionApplied?.missionText?.slice(0, 1000), runtime: out.solutionApplied?.runtime, next: out.solutionApplied?.missionNext },
  conclusion: out.conclusion?.missionText?.slice(0, 2500),
  afterExit: { factors: out.afterExit?.consoleFactors, apply: out.afterExit?.apply, runtime: out.afterExit?.runtime },
  degradedSim: { readout: out.degradedSim?.readout, factors: out.degradedSim?.consoleFactors, runtime: out.degradedSim?.runtime },
  missionFromDegraded: { text: out.missionFromDegraded?.missionText?.slice(0, 700), factors: out.missionFromDegraded?.consoleFactors, runtime: out.missionFromDegraded?.runtime },
  errors,
}, null, 2));
await browser.close();
