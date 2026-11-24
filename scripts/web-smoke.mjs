// Headless-Chrome smoke test of the exported web app. Needs: npm i -D puppeteer-core (not installed by default),
// a Chrome at /usr/bin/google-chrome, and the export served on :8765 (npx expo export --platform web; python3 -m http.server 8765 -d apps/app/dist).
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1100, height: 1400 });
await page.goto(process.env.URL ?? 'http://localhost:8765/', { waitUntil: 'networkidle0' });
await page.waitForSelector('[data-testid="notation"] svg', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1000));
const info = await page.evaluate(() => ({
  noteheads: document.querySelectorAll('[data-testid="notation"] svg .vf-stavenote').length,
  staves: document.querySelectorAll('[data-testid="notation"] svg .vf-stave').length,
  tabOut: document.querySelector('[data-testid="tab-output"]')?.textContent,
}));
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: './web.png', fullPage: true });
// Play: patch AudioContext to count oscillators
await page.evaluate(() => {
  window.__osc = 0;
  const orig = AudioContext.prototype.createOscillator;
  AudioContext.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
});
await page.click('[data-testid="play"]');
await new Promise((r) => setTimeout(r, 800));
console.log('oscillators scheduled:', await page.evaluate(() => window.__osc));
console.log('play button text:', await page.$eval('[data-testid="play"]', (e) => e.textContent));
// switch to MusicXML input (round-trips current score through MusicXML import)
await page.click('[data-testid="play"]');
const chips = await page.$$('div[tabindex="0"]');
for (const c of chips) { if ((await c.evaluate((e) => e.textContent)) === 'musicxml') { await c.click(); break; } }
await new Promise((r) => setTimeout(r, 800));
console.log('musicxml mode:', JSON.stringify(await page.evaluate(() => ({
  editorStartsWithXml: document.querySelector('[data-testid="tab-input"]').value.startsWith('<?xml'),
  noteheads: document.querySelectorAll('[data-testid="notation"] svg .vf-stavenote').length,
  tabOut: document.querySelector('[data-testid="tab-output"]')?.textContent,
}))));
await page.screenshot({ path: './web-musicxml.png', fullPage: false });
for (const c of await page.$$('div[tabindex="0"]')) { if ((await c.evaluate((e) => e.textContent)) === 'tab') { await c.click(); break; } }
await new Promise((r) => setTimeout(r, 300));
// edit tab -> check update + error path
await page.click('[data-testid="tab-input"]', { clickCount: 1 });
await page.evaluate(() => { const t = document.querySelector('[data-testid="tab-input"]'); t.select(); });
await page.keyboard.type('garbage');
await new Promise((r) => setTimeout(r, 300));
console.log('after bad input:', await page.evaluate(() => document.body.innerText.includes('No tab found')));
console.log('errors:', errors);
await browser.close();
