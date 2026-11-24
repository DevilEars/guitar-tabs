// Headless-Chrome smoke test of the exported web app in local (signed-out) mode.
// Usage: npm run build && npm run smoke            (serves apps/app/dist under /guitar-tabs/)
//        URL=https://devilears.github.io/guitar-tabs/ npm run smoke   (test a deployed site)
// Needs Chrome: CHROME_PATH or /usr/bin/google-chrome.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const DIST = path.resolve('apps/app/dist');
const BASE = '/guitar-tabs/';
const types = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png', '.ttf': 'font/ttf' };

let server;
let url = process.env.URL;
if (!url) {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith(BASE)) { res.writeHead(404).end(); return; }
    let file = path.join(DIST, p.slice(BASE.length));
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(0);
  url = `http://127.0.0.1:${server.address().port}${BASE}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept()); // delete confirmations
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const tid = (id) => `[data-testid="${id}"]`;
  const text = (sel) => page.$eval(sel, (e) => e.textContent ?? '');
  const rows = () => page.$$eval(tid('tab-row'), (els) => els.map((e) => e.textContent));
  const typeInto = async (sel, value) => {
    await page.click(sel);
    await page.$eval(sel, (e) => e.select());
    await page.keyboard.press('Backspace');
    await page.type(sel, value);
  };

  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector(tid('new-tab'));
  check('library loads empty', (await rows()).length === 0);
  check('local-only badge', (await text(tid('sync-badge'))) === 'On this device');

  // Create
  await page.click(tid('new-tab'));
  await page.waitForSelector(tid('tab-input'));
  await typeInto(tid('title-input'), 'Smoke Riff');
  await typeInto(tid('artist-input'), 'Test Band');
  await typeInto(tid('tab-input'), 'e|-0-3-5-|\nB|--------|\nG|--------|\nD|--------|\nA|--------|\nE|--------|\n');
  const during = await text(tid('save-status'));
  await page.waitForFunction((s) => document.querySelector(s)?.textContent?.startsWith('Saved'), { timeout: 5000 }, tid('save-status'));
  check('autosave indicator Saving -> Saved', during.startsWith('Saving') || during.startsWith('Saved'), `${during} -> ${await text(tid('save-status'))}`);
  await page.waitForSelector('[data-testid="notation"] svg .vf-stavenote', { timeout: 10000 });
  check('notation renders', (await page.$$('[data-testid="notation"] svg .vf-stavenote')).length === 3);
  await page.screenshot({ path: 'smoke-editor.png' });

  // Autosave survives reload (reload straight from the editor after the save)
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector(tid('tab-row'));
  let r = await rows();
  check('tab survives reload', r.length === 1 && r[0].includes('Smoke Riff') && r[0].includes('Test Band'), r[0]);
  await page.click(tid('open-tab'));
  await page.waitForSelector(tid('tab-input'));
  check('content survives reload', (await page.$eval(tid('tab-input'), (e) => e.value)).startsWith('e|-0-3-5-|'));
  await page.click(tid('play'));
  await sleep(300);
  check('play button toggles', (await text(tid('play'))) === 'Stop');
  await page.click(tid('play'));
  await page.click(tid('back'));
  await page.waitForSelector(tid('tab-row'));

  // Rename
  await page.click(tid('rename'));
  await page.waitForSelector(tid('prompt-input'));
  await typeInto(tid('prompt-input'), 'Renamed Riff');
  await page.click(tid('prompt-ok'));
  await sleep(300);
  check('rename', (await rows())[0].includes('Renamed Riff'));

  // Duplicate + search
  await page.click(tid('duplicate'));
  await sleep(300);
  r = await rows();
  check('duplicate', r.length === 2 && r.some((x) => x.includes('Renamed Riff (copy)')));
  await typeInto(tid('search'), 'copy');
  await sleep(200);
  check('search filters', (await rows()).length === 1);
  await typeInto(tid('search'), ' ');
  await page.$eval(tid('search'), (e) => e.select());
  await page.keyboard.press('Backspace');
  await sleep(200);

  // Delete (confirm accepted)
  await page.click(tid('delete'));
  await sleep(300);
  check('delete with confirm', (await rows()).length === 1);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector(tid('tab-row'));
  r = await rows();
  check('rename + delete survive reload', r.length === 1 && r[0].includes('Renamed Riff'), r.join(' | '));

  // Import .txt and MusicXML via the file picker
  const tmp = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP ?? '/tmp', 'smoke-'));
  const txt = path.join(tmp, 'Imported Txt.txt');
  fs.writeFileSync(txt, 'e|-----|\nB|-1---|\nG|-----|\nD|-----|\nA|-3---|\nE|-----|\n');
  const xml = path.join(tmp, 'song.musicxml');
  fs.writeFileSync(xml, `<?xml version="1.0"?><score-partwise version="4.0"><work><work-title>Imported XML</work-title></work><part-list><score-part id="P1"><part-name>G</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>2</divisions></attributes><note><pitch><step>E</step><octave>2</octave></pitch><duration>2</duration><type>quarter</type></note><note><pitch><step>A</step><octave>2</octave></pitch><duration>2</duration><type>quarter</type></note></measure></part></score-partwise>`);
  for (const f of [txt, xml]) {
    const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(tid('import'))]);
    await chooser.accept([f]);
    await sleep(500);
  }
  r = await rows();
  check('import .txt and MusicXML', r.length === 3 && r.some((x) => x.includes('Imported Txt')) && r.some((x) => x.includes('Imported XML')), r.map((x) => x.slice(0, 20)).join(' | '));

  // Account screen in local mode
  await page.click(tid('account-button'));
  await page.waitForSelector(tid('signin-unavailable'));
  check('sign-in unavailable note', (await text(tid('signin-unavailable'))).includes('Sign in unavailable'));
  await page.goBack();
  await page.waitForSelector(tid('tab-row'));
  check('browser back returns to library', true);
  await page.screenshot({ path: 'smoke-library.png' });

  check('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server?.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
