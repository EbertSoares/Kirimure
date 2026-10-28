import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = '/tmp/kirimure-qa';
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console] ${m.text()}`); });

const read = () => page.evaluate(() => {
  const rt = window.__kirimureRuntime;
  return {
    day: rt ? Number(rt.state.elapsedDays.toFixed(2)) : null,
    paused: rt?.state.paused,
    speed: rt?.state.speed,
    oxygen: rt ? Number(rt.state.dissolvedOxygen.toFixed(2)) : null,
    health: rt ? { coral: Math.round(rt.state.health.coral), fish: Math.round(rt.state.health.fish), overall: Math.round(rt.state.overall) } : null,
    challengeCards: [...document.querySelectorAll('.challenge-card')].map((b) => ({
      text: b.innerText.replace(/\n/g, ' | '),
      cls: b.className,
    })),
    missionText: document.querySelector('.mission-active-panel')?.innerText,
    apply: (() => { const b = document.querySelector('.apply-button'); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; })(),
    pause: (() => { const b = document.querySelector('.pause-button'); return b ? { text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') } : null; })(),
  };
});

await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.locator('g.state.available').click();
await page.waitForTimeout(2500);

const out = {};
out.initial = await read();
await page.waitForTimeout(1200);
out.stillPaused = await read();
await page.locator('.pause-button').click();
await page.waitForTimeout(300);
out.running = await read();
out.speeds = {};
for (const label of ['1x', '3x', '5x', '10x']) {
  await page.locator('.speed-control button', { hasText: label }).click();
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => window.__kirimureRuntime?.state.elapsedDays ?? null);
  await page.waitForTimeout(2000);
  const after = await page.evaluate(() => window.__kirimureRuntime?.state.elapsedDays ?? null);
  out.speeds[label] = { before: Number(before.toFixed(2)), after: Number(after.toFixed(2)), delta: Number((after - before).toFixed(2)) };
}
await page.locator('.pause-button').click();
await page.waitForTimeout(300);
out.pausedAfter = await read();
await page.waitForTimeout(1000);
out.pausedStill = await read();
await page.screenshot({ path: `${OUT}/flow-pause-speed.png` });

// challenges
await page.locator('.reset-button').click();
await page.waitForTimeout(500);
await page.getByRole('tab', { name: 'Desafios' }).click();
await page.waitForTimeout(200);
out.challengesInitial = await read();
await page.locator('.pause-button').click();
await page.locator('.speed-control button', { hasText: '10x' }).click();
await page.waitForTimeout(12500);
out.challenges30 = await read();
await page.screenshot({ path: `${OUT}/flow-challenges-30days-valid.png` });
await page.waitForTimeout(7500);
out.challenges45 = await read();
await page.screenshot({ path: `${OUT}/flow-challenges-45days-valid.png` });

// mission with 100 t to reach hypoxia
await page.locator('.reset-button').click();
await page.waitForTimeout(500);
await page.getByRole('tab', { name: 'Desafios' }).click();
await page.getByRole('button', { name: /Iniciar Missão Guiada/ }).click();
await page.waitForTimeout(200);
await page.getByRole('button', { name: /Formular Previsão/ }).click();
await page.locator('.mission-hypothesis-choice').nth(1).click();
await page.getByRole('button', { name: /Confirmar e Iniciar Experimento/ }).click();
await page.waitForTimeout(200);
const sewage = page.locator('#factor-sewage');
await sewage.focus();
await sewage.press('End');
out.mission100BeforeApply = await read();
await page.locator('.apply-button').click();
await page.waitForTimeout(300);
out.mission100Applied = await read();
await page.locator('.speed-control button', { hasText: '10x' }).click();
await page.waitForTimeout(4500);
out.mission100After10days = await read();
await page.screenshot({ path: `${OUT}/flow-mission-100t-10days.png` });

const investigate = page.locator('.mission-next-btn', { hasText: /Investigar Solução/ });
out.investigate = { count: await investigate.count(), disabled: await investigate.isDisabled().catch(() => null) };
if (await investigate.count() && !(await investigate.isDisabled())) {
  await investigate.click();
  await page.waitForTimeout(200);
  await page.locator('.mission-solution-btn').click();
  await page.waitForTimeout(200);
  await page.locator('.mission-next-btn', { hasText: /Ver Conclusão/ }).click();
  await page.waitForTimeout(300);
  out.conclusionText = (await read()).missionText;
  out.conclusionLayout = await page.evaluate(() => {
    const q = (sel) => document.querySelector(sel);
    const rect = (el) => el ? (() => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1) }; })() : null;
    const card = q('.mission-step-card');
    const table = q('.mission-evidence-table');
    const wrap = q('.table-responsive');
    const panel = q('.science-panel');
    const body = q('.panel-body');
    const scroller = (el) => el ? { sw: el.scrollWidth, cw: el.clientWidth, sl: el.scrollLeft, overflowX: getComputedStyle(el).overflowX } : null;
    return {
      card: rect(card), cardScroll: scroller(card),
      table: rect(table), tableScroll: scroller(table),
      wrap: rect(wrap), wrapScroll: scroller(wrap),
      panel: rect(panel), panelScroll: scroller(panel),
      body: rect(body), bodyScroll: scroller(body),
      clippedCells: [...document.querySelectorAll('.mission-evidence-table th, .mission-evidence-table td')]
        .filter((el) => el.scrollWidth > el.clientWidth + 2)
        .map((el) => ({ text: el.textContent.trim().slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth })),
      visibleTextRight: Math.max(...[...document.querySelectorAll('.mission-step-card p, .mission-step-card td, .mission-step-card th')]
        .map((el) => el.getBoundingClientRect().right)),
      panelRight: panel?.getBoundingClientRect().right,
    };
  });
  await page.screenshot({ path: `${OUT}/flow-conclusion-100t.png` });
  await page.locator('.mission-next-btn', { hasText: /Concluir Missão/ }).click();
  await page.waitForTimeout(300);
  out.afterMissionExit = await read();
}

await fs.writeFile(`${OUT}/flows2.json`, JSON.stringify({ ...out, errors }, null, 2));
console.log(JSON.stringify({
  initial: { day: out.initial.day, paused: out.initial.paused, pause: out.initial.pause },
  stillPaused: out.stillPaused.day,
  running: { day: out.running.day, paused: out.running.paused, pause: out.running.pause },
  speeds: out.speeds,
  pausedAfter: { day: out.pausedAfter.day, paused: out.pausedAfter.paused, pause: out.pausedAfter.pause },
  pausedStill: out.pausedStill.day,
  challengesInitial: out.challengesInitial.challengeCards,
  challenges30: { day: out.challenges30.day, cards: out.challenges30.challengeCards },
  challenges45: { day: out.challenges45.day, cards: out.challenges45.challengeCards },
  mission100: {
    before: { day: out.mission100BeforeApply.day, oxygen: out.mission100BeforeApply.oxygen },
    applied: { day: out.mission100Applied.day, oxygen: out.mission100Applied.oxygen, paused: out.mission100Applied.paused },
    after10d: { day: out.mission100After10days.day, oxygen: out.mission100After10days.oxygen, health: out.mission100After10days.health, mission: out.mission100After10days.missionText?.slice(-900) },
    investigate: out.investigate,
  },
  conclusionLayout: out.conclusionLayout,
  conclusionText: out.conclusionText,
  afterMissionExit: { apply: out.afterMissionExit?.apply, day: out.afterMissionExit?.day },
  errors,
}, null, 2));
await browser.close();
