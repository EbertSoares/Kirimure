import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const OUT = '/tmp/kirimure-qa';
await fs.mkdir(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
  { name: 'tablet-768x1024', width: 768, height: 1024, mobile: true },
  { name: 'tablet-land-1024x768', width: 1024, height: 768, mobile: false },
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
});

const measure = () => {
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), bottom: +r.bottom.toFixed(1) };
  };
  const overlap = (a, b) => {
    if (!a || !b) return 0;
    const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return +(x * y).toFixed(0);
  };
  const scene = rect('.scene-card');
  const panel = rect('.science-panel');
  const consoleEl = rect('.teaching-console');
  const topbar = rect('.topbar');
  const clipped = [...document.querySelectorAll('button, p, span, small, strong, h1, h2, h3, h4, li, td, th, dt, dd, label')]
    .filter((el) => {
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden' || !el.getClientRects().length) return false;
      return el.scrollWidth > el.clientWidth + 2 && s.overflowX !== 'visible';
    })
    .slice(0, 40)
    .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 60), text: el.textContent.trim().slice(0, 80), sw: el.scrollWidth, cw: el.clientWidth, overflow: getComputedStyle(el).overflowX }));
  const smallTargets = [...document.querySelectorAll('button, [role="button"], a, input')]
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 30);
    })
    .slice(0, 40)
    .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 50), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 60), w: +el.getBoundingClientRect().width.toFixed(1), h: +el.getBoundingClientRect().height.toFixed(1) }));
  const horizontalScrollers = [...document.querySelectorAll('*')]
    .filter((el) => {
      const s = getComputedStyle(el);
      return el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && (s.overflowX === 'auto' || s.overflowX === 'scroll');
    })
    .slice(0, 20)
    .map((el) => ({ tag: el.tagName, cls: String(el.className).slice(0, 60), sw: el.scrollWidth, cw: el.clientWidth }));
  return {
    viewport: { w: innerWidth, h: innerHeight },
    doc: { sw: document.scrollingElement.scrollWidth, sh: document.scrollingElement.scrollHeight, cw: document.scrollingElement.clientWidth, ch: document.scrollingElement.clientHeight, scrollY },
    overflowX: document.scrollingElement.scrollWidth > document.scrollingElement.clientWidth + 1,
    scene, panel, consoleEl, topbar,
    overlaps: {
      scenePanel: overlap(scene, panel),
      sceneConsole: overlap(scene, consoleEl),
      consolePanel: overlap(consoleEl, panel),
      topbarScene: overlap(topbar, scene),
    },
    clipped,
    smallTargets,
    horizontalScrollers,
    bodyText: document.body.innerText.slice(0, 1200),
  };
};

const out = {};
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    deviceScaleFactor: vp.mobile ? 2 : 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/resp-${vp.name}-map.png` });
  const map = await page.evaluate(measure);

  // unavailable state warning
  await page.locator('[aria-label*="Acre"]').click();
  await page.waitForTimeout(250);
  const warning = await page.evaluate(() => {
    const el = document.querySelector('.map-warning');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { text: el.innerText, x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), inViewport: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight };
  });
  await page.screenshot({ path: `${OUT}/resp-${vp.name}-map-warning.png` });

  // available state
  await page.locator('g.state.available').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/resp-${vp.name}-sim.png` });
  await page.screenshot({ path: `${OUT}/resp-${vp.name}-sim-full.png`, fullPage: true });
  const sim = await page.evaluate(measure);

  // tabs
  const tabs = {};
  for (const tab of ['Indicadores', 'Espécies', 'Histórico', 'Desafios']) {
    await page.getByRole('tab', { name: tab }).click();
    await page.waitForTimeout(120);
    const data = await page.evaluate(() => {
      const panel = document.querySelector('.panel-body');
      const r = panel?.getBoundingClientRect();
      return {
        panelText: panel?.innerText.slice(0, 900),
        panelBox: r ? { y: +r.y.toFixed(1), h: +r.height.toFixed(1) } : null,
        panelScroll: panel ? { top: panel.scrollTop, sh: panel.scrollHeight, ch: panel.clientHeight } : null,
        docScrollY: scrollY,
      };
    });
    tabs[tab] = data;
    await page.screenshot({ path: `${OUT}/resp-${vp.name}-tab-${tab}.png` });
  }

  // modal
  await page.getByRole('tab', { name: 'Agora' }).click();
  await page.waitForTimeout(100);
  await page.locator('.environment-readout button').first().click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/resp-${vp.name}-modal.png` });
  const modal = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const content = document.querySelector('.indicator-modal-content');
    const close = document.querySelector('.indicator-modal-close');
    const r = content?.getBoundingClientRect();
    const cr = close?.getBoundingClientRect();
    return {
      content: r ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null,
      inViewport: r ? r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight : null,
      close: cr ? { x: +cr.x.toFixed(1), y: +cr.y.toFixed(1), w: +cr.width.toFixed(1), h: +cr.height.toFixed(1) } : null,
      focus: document.activeElement?.className,
      bodyOverflow: getComputedStyle(document.body).overflow,
      scrollHeight: document.scrollingElement.scrollHeight,
    };
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);

  // mission intro + conclusion layout
  await page.getByRole('tab', { name: 'Desafios' }).click();
  await page.waitForTimeout(150);
  const startVisible = await page.getByRole('button', { name: /Iniciar Missão Guiada/ }).count();
  let mission = null;
  if (startVisible) {
    await page.getByRole('button', { name: /Iniciar Missão Guiada/ }).click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/resp-${vp.name}-mission-intro.png` });
    mission = await page.evaluate(() => {
      const panel = document.querySelector('.science-panel');
      const body = document.querySelector('.panel-body');
      const r = panel?.getBoundingClientRect();
      const factor = document.querySelector('.direct-factor');
      return {
        panelRect: r ? { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } : null,
        bodyScroll: body ? { top: body.scrollTop, sh: body.scrollHeight, ch: body.clientHeight } : null,
        missionText: document.querySelector('.mission-active-panel')?.innerText.slice(0, 1200),
        factorText: factor?.innerText,
        startBtnTop: (() => { const b = document.querySelector('.map-back-button'); const br = b?.getBoundingClientRect(); return br ? +br.top.toFixed(1) : null; })(),
      };
    });
  }

  out[vp.name] = { map, warning, sim, tabs, modal, mission, errors };
  await page.close();
}

await fs.writeFile(`${OUT}/responsive.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, {
  mapOverflow: v.map.overflowX,
  mapDoc: v.map.doc,
  warning: v.warning,
  simOverflow: v.sim.overflowX,
  simDoc: v.sim.doc,
  simBoxes: { scene: v.sim.scene, panel: v.sim.panel, console: v.sim.consoleEl, topbar: v.sim.topbar },
  overlaps: v.sim.overlaps,
  clipped: v.sim.clipped,
  smallTargets: v.sim.smallTargets,
  modal: v.modal,
  mission: v.mission && { panelRect: v.mission.panelRect, bodyScroll: v.mission.bodyScroll, factorText: v.mission.factorText },
  errors: v.errors,
}])), null, 2));
await browser.close();
