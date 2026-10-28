import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto('http://127.0.0.1:8080/', { waitUntil: 'networkidle' });
await page.locator('g.state.available').click();
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.direct-factor')].map((el) => ({
    cls: el.className,
    label: el.querySelector('.factor-name')?.textContent,
    value: el.querySelector('.factor-value')?.textContent,
    rect: el.getBoundingClientRect().toJSON(),
    font: getComputedStyle(el.querySelector('.factor-name')).fontSize,
    status: el.querySelector('.factor-status')?.textContent,
    statusFont: el.querySelector('.factor-status') ? getComputedStyle(el.querySelector('.factor-status')).fontSize : null,
  }));
  const badges = [...document.querySelectorAll('.epistemological-badge, .indicator-badge')].map((el) => ({ text: el.textContent, cls: el.className, font: getComputedStyle(el).fontSize, color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor, rect: el.getBoundingClientRect().toJSON() }));
  const overflow = [...document.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0).slice(0, 20).map((el) => ({ tag: el.tagName, cls: el.className?.toString().slice(0, 80), sw: el.scrollWidth, cw: el.clientWidth }));
  const allTexts = [...document.querySelectorAll('p,span,small,strong,em,h1,h2,h3,button,li,td,th')].map((el) => {
    const s = getComputedStyle(el);
    return { tag: el.tagName, cls: el.className?.toString().slice(0, 40), text: el.textContent?.trim().slice(0, 100), fs: parseFloat(s.fontSize), lh: s.lineHeight, color: s.color, rect: el.getBoundingClientRect().toJSON() };
  }).filter((x) => x.text && x.rect.width > 0 && x.rect.height > 0);
  return { cards, badges, overflow, tinyTexts: allTexts.filter((x) => x.fs < 11).slice(0, 50), textsCount: allTexts.length };
});
console.log(JSON.stringify({ out, logs }, null, 2));
await browser.close();
