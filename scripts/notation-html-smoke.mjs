// Headless-Chrome check of the Android notation WebView page (apps/app/src/notation/notationHtml.generated.ts).
// Android System WebView is Chromium, so this exercises the same page + postMessage protocol the app uses,
// with window.ReactNativeWebView mocked. Optional SCREENSHOT=path.png. Needs Chrome: CHROME_PATH or /usr/bin/google-chrome.
import fs from 'node:fs';
import http from 'node:http';
import puppeteer from 'puppeteer-core';

const src = fs.readFileSync('apps/app/src/notation/notationHtml.generated.ts', 'utf8');
const html = JSON.parse(src.slice(src.indexOf('= ') + 2, src.lastIndexOf(';\nexport default')));

const p = (name, midi) => {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  return { midi, step: m[1], alter: m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0, octave: Number(m[3]), name };
};
const q = { type: 'q', dots: 0 }, e8 = { type: '8', dots: 0 };
const score = {
  time: { beats: 4, beatType: 4 }, tempo: 100,
  measures: [
    { notes: [{ pitches: [p('E2', 40)], duration: q }, { pitches: [p('G#3', 56)], duration: q }, { pitches: [p('B3', 59), p('E4', 64)], duration: q }, { pitches: [], duration: q }] },
    { notes: [{ pitches: [p('A2', 45)], duration: e8 }, { pitches: [p('C4', 60)], duration: e8 }, { pitches: [p('E4', 64)], duration: e8 }, { pitches: [p('A4', 69)], duration: e8 }, { pitches: [p('D3', 50)], duration: { type: 'h', dots: 0 } }] },
    { notes: [{ pitches: [p('E3', 52)], duration: { type: 'h', dots: 1 } }, { pitches: [p('Bb3', 58)], duration: q }] },
  ],
};

// serve the page from a throwaway local origin (setContent would skip evaluateOnNewDocument)
const server = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }).end(html); }).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const pageUrl = `http://127.0.0.1:${server.address().port}/`;

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`); };
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 392, height: 800, deviceScaleFactor: 2.75 }); // Pixel-ish phone
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => errors.push('request ' + r.url()));
  await page.evaluateOnNewDocument(() => {
    window.__msgs = [];
    window.ReactNativeWebView = { postMessage: (s) => window.__msgs.push(JSON.parse(s)) };
  });
  await page.setRequestInterception(true);
  const external = [];
  page.on('request', (r) => { if (!r.url().startsWith('data:') && r.url() !== pageUrl) external.push(r.url()); r.continue(); });
  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__msgs.some((m) => m.type === 'ready'), { timeout: 10000 });
  check('page posts ready', true);
  const fontOk = await page.evaluate(() => document.fonts.check('30px Bravura'));
  check('Bravura font loaded from the inlined bundle', fontOk);
  // react-native-webview on Android delivers postMessage as a 'message' event on document
  await page.evaluate((s) => document.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'score', score: s }) })), score);
  await page.waitForFunction(() => window.__msgs.some((m) => m.type === 'height' || m.type === 'error'), { timeout: 10000 });
  const msg = await page.evaluate(() => window.__msgs.find((m) => m.type === 'height' || m.type === 'error'));
  check('score renders without error', msg.type === 'height', JSON.stringify(msg));
  const stats = await page.evaluate(() => ({
    svgs: document.querySelectorAll('#n svg').length,
    notes: document.querySelectorAll('#n .vf-stavenote').length,
    width: document.querySelector('#n svg')?.getBoundingClientRect().width ?? 0,
    vw: document.documentElement.clientWidth,
  }));
  check('one SVG, 11 stave notes (incl. rest)', stats.svgs === 1 && stats.notes === 11, JSON.stringify(stats));
  check('fits the phone width', stats.width <= stats.vw, `${stats.width} <= ${stats.vw}`);
  check('reported height > 0 and wraps to >1 line', msg.height > 150, String(msg.height));
  // iOS path (window message) + re-render with a different score
  await page.evaluate((s) => window.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'score', score: { ...s, measures: s.measures.slice(0, 1) } }) })), score);
  await page.waitForFunction(() => document.querySelectorAll('#n .vf-stavenote').length === 4, { timeout: 5000 });
  check('re-render on new score (window message)', true);
  check('no page errors', errors.length === 0, errors.join('; '));
  check('no network requests (fully inlined)', external.length === 0, external.join(', '));
  await page.evaluate((s) => document.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type: 'score', score: s }) })), score);
  await page.waitForFunction(() => document.querySelectorAll('#n .vf-stavenote').length === 11, { timeout: 5000 });
  if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT, fullPage: true });
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} notation page checks passed`);
process.exit(failed ? 1 : 0);
