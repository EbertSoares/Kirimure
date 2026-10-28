import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = '/tmp/kirimure-qa';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

const snap = () => page.evaluate(() => {
  const rt = window.__kirimureRuntime;
  return {
    screen: document.querySelector('.simulation-app') ? 'simulation' : 'map',
    day: rt ? Number(rt.state.elapsedDays.toFixed(2)) : null,
    paused: rt?.state.paused,
    speed: rt?.state.speed,
    oxygen: rt ? Number(rt.state.dissolvedOxygen.toFixed(2)) : null,
    readout: [...document.querySelectorAll('.environment-readout button')].map((b) => b.innerText.replace(/\n/g, ' ')),
    tabs: [...document.querySelectorAll('[role="tab"]')].map((b) => ({ text: b.textContent.trim(), selected: b.getAttribute('aria-selected'), tabindex: b.getAttribute('tabindex') })),
    activeTab: document.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim(),
    panelText: document.querySelector('.panel-body')?.innerText.slice(0, 800),
    apply: (() => { const b = document.querySelector('.apply-button'); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; })(),
    mission: Boolean(document.querySelector('.mission-active-panel')),
    challengeCards: [...document.querySelectorAll('.challenge-card')].map((b) => b.innerText.replace(/\n/g, ' | ').slice(0, 220)),
    notices: [...document.querySelectorAll('.factor-notice-pill')].map((el) => el.innerText),
    activeEl: { tag: document.activeElement?.tagName, cls: String(document.activeElement?.className ?? ''), text: document.activeElement?.textContent?.trim().slice(0, 60), aria: document.activeElement?.getAttribute?.('aria-label') },
    toast: document.querySelector('.map-warning')?.innerText ?? null,
    event: document.querySelector('.timeline-event')?.innerText.replace(/\n/g, ' '),
  };
});

const out = {};

// ---- map keyboard / warning ----
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.locator('[aria-label*="Acre"]').click();
await page.waitForTimeout(200);
out.warningOpen = await snap();
await page.getByRole('button', { name: 'Entendi' }).click();
await page.waitForTimeout(200);
out.warningDismissed = await snap();

// Tab to Bahia and activate with Enter
let stops = [];
for (let i = 0; i < 40; i += 1) {
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => ({
    aria: document.activeElement?.getAttribute?.('aria-label'),
    tag: document.activeElement?.tagName,
    outline: getComputedStyle(document.activeElement).outlineStyle,
    outlineWidth: getComputedStyle(document.activeElement).outlineWidth,
  }));
  stops.push(focused);
  if (focused.aria?.includes('Bahia')) break;
}
out.keyboardStops = stops;
out.bahiaFocused = stops.at(-1);
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
out.afterEnterSim = await snap();
await page.screenshot({ path: `${OUT}/flow-entered-by-keyboard.png` });

// ---- pause / speed ----
await page.locator('.pause-button').click();
await page.waitForTimeout(100);
const pauseStart = await snap();
await page.waitForTimeout(1500);
const pauseEnd = await snap();
out.pause = { startDay: pauseStart.day, endDay: pauseEnd.day, pressed: await page.locator('.pause-button').getAttribute('aria-pressed'), label: await page.locator('.pause-button').innerText() };
await page.locator('.pause-button').click();
await page.waitForTimeout(200);
out.speeds = {};
for (const label of ['1x', '3x', '5x', '10x']) {
  await page.locator('.speed-control button', { hasText: label }).click();
  const before = await page.evaluate(() => window.__kirimureRuntime?.state.elapsedDays ?? null);
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => window.__kirimureRuntime?.state.elapsedDays ?? null);
  out.speeds[label] = { before: Number(before?.toFixed(2)), after: Number(after?.toFixed(2)), delta: Number((after - before).toFixed(2)), active: await page.locator('.speed-control button.active').innerText() };
}

// ---- challenges: run 45 days at 10x ----
await page.locator('.reset-button').click();
await page.waitForTimeout(500);
await page.getByRole('tab', { name: 'Desafios' }).click();
await page.waitForTimeout(200);
out.challengesInitial = await snap();
await page.locator('.speed-control button', { hasText: '10x' }).click();
await page.waitForTimeout(12500);
out.challenges30 = await snap();
await page.screenshot({ path: `${OUT}/flow-challenges-30days.png` });
await page.waitForTimeout(7500);
out.challenges45 = await snap();
await page.screenshot({ path: `${OUT}/flow-challenges-45days.png` });

// ---- microplastics message at 100t, 8 days ----
await page.locator('.reset-button').click();
await page.waitForTimeout(500);
const slider = page.locator('#factor-microplastics');
await slider.focus();
await slider.press('End');
await page.locator('.apply-button').click();
await page.locator('.speed-control button', { hasText: '10x' }).click();
await page.waitForTimeout(3500);
out.microplastics8 = await snap();
await page.screenshot({ path: `${OUT}/flow-microplastics-8days.png` });

// ---- reset restores ----
await page.locator('.reset-button').click();
await page.waitForTimeout(500);
out.afterReset = await snap();

// ---- return to map and back ----
await page.locator('.map-back-button').click();
await page.waitForTimeout(1200);
out.backOnMap = await snap();
await page.locator('g.state.available').click();
await page.waitForTimeout(3000);
out.reentered = await snap();

// ---- modal focus trap ----
await page.locator('.environment-readout button').first().click();
await page.waitForTimeout(200);
out.modalOpen = await snap();
for (let i = 0; i < 8; i += 1) await page.keyboard.press('Tab');
out.modalAfterTabs = await snap();
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
out.modalClosed = await snap();

// ---- tabs arrow keys ----
await page.getByRole('tab', { name: 'Agora' }).focus();
await page.keyboard.press('ArrowRight');
out.tabAfterArrow = await snap();

// ---- mission: verify cannot skip and conclusion measurements ----
await page.getByRole('tab', { name: 'Desafios' }).click();
await page.getByRole('button', { name: /Iniciar Missão Guiada/ }).click();
await page.waitForTimeout(200);
out.missionIntro = await snap();
const solutionBtn = page.locator('.mission-next-btn', { hasText: /Investigar Solução/ });
out.solutionBeforeExperiment = { count: await solutionBtn.count(), disabled: await solutionBtn.isDisabled().catch(() => null) };
await page.getByRole('button', { name: /Formular Previsão/ }).click();
await page.locator('.mission-hypothesis-choice').nth(1).click();
await page.getByRole('button', { name: /Confirmar e Iniciar Experimento/ }).click();
await page.waitForTimeout(200);
out.missionExperiment = await snap();
await page.locator('.speed-control button', { hasText: '10x' }).click();
await page.waitForTimeout(3000);
out.missionAfter3s = await snap();
await page.locator('.mission-next-btn', { hasText: /Investigar Solução/ }).click().catch(() => {});
await page.waitForTimeout(150);
await page.locator('.mission-solution-btn').click().catch(() => {});
await page.waitForTimeout(150);
await page.locator('.mission-next-btn', { hasText: /Ver Conclusão/ }).click().catch(() => {});
await page.waitForTimeout(300);
out.conclusionLayout = await page.evaluate(() => {
  const card = document.querySelector('.mission-step-card');
  const table = document.querySelector('.mission-evidence-table');
  const wrap = document.querySelector('.table-responsive');
  const panel = document.querySelector('.science-panel');
  const body = document.querySelector('.panel-body');
  const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; })() : null;
  return {
    card: rect(card), cardScroll: card ? { sw: card.scrollWidth, cw: card.clientWidth } : null,
    table: rect(table), tableScroll: table ? { sw: table.scrollWidth, cw: table.clientWidth } : null,
    wrap: rect(wrap), wrapScroll: wrap ? { sw: wrap.scrollWidth, cw: wrap.clientWidth, overflowX: getComputedStyle(wrap).overflowX } : null,
    panel: rect(panel), panelScroll: panel ? { sw: panel.scrollWidth, cw: panel.clientWidth } : null,
    body: rect(body), bodyScroll: body ? { sw: body.scrollWidth, cw: body.clientWidth, sh: body.scrollHeight, ch: body.clientHeight, overflowX: getComputedStyle(body).overflowX } : null,
    clippedText: [...document.querySelectorAll('.mission-step-card p, .mission-step-card td, .mission-step-card th')]
      .filter((el) => el.scrollWidth > el.clientWidth + 2)
      .map((el) => ({ text: el.textContent.trim().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth })),
  };
});
await page.screenshot({ path: `${OUT}/flow-conclusion-current.png` });

await fs.writeFile(`${OUT}/flows.json`, JSON.stringify({ ...out, errors }, null, 2));
console.log(JSON.stringify({
  warningOpen: out.warningOpen.toast,
  warningDismissed: out.warningDismissed.toast,
  bahiaFocused: out.bahiaFocused,
  afterEnterSim: out.afterEnterSim.screen,
  pause: out.pause,
  speeds: out.speeds,
  challengesInitial: out.challengesInitial.challengeCards,
  challenges30: out.challenges30.challengeCards,
  challenges45: out.challenges45.challengeCards,
  microplastics8: { day: out.microplastics8.day, notices: out.microplastics8.notices, panel: out.microplastics8.panelText, event: out.microplastics8.event },
  afterReset: { day: out.afterReset.day, oxygen: out.afterReset.oxygen, apply: out.afterReset.apply, tabs: out.afterReset.tabs, activeTab: out.afterReset.activeTab },
  backOnMap: out.backOnMap.screen,
  reentered: { screen: out.reentered.screen, day: out.reentered.day, oxygen: out.reentered.oxygen },
  modalOpen: out.modalOpen.activeEl,
  modalAfterTabs: out.modalAfterTabs.activeEl,
  modalClosed: out.modalClosed.activeEl,
  tabAfterArrow: out.tabAfterArrow.tabs,
  solutionBeforeExperiment: out.solutionBeforeExperiment,
  missionExperiment: out.missionExperiment.mission,
  missionAfter3s: { notices: out.missionAfter3s.notices, panel: out.missionAfter3s.panelText, event: out.missionAfter3s.event },
  conclusionLayout: out.conclusionLayout,
  errors,
}, null, 2));
await browser.close();
