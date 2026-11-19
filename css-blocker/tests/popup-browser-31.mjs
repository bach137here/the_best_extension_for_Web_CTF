import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const task = await taskSpace('CTF simple verification');
const pages = await task.pages();
const page = pages.find(page => page.label === 'p2') || await task.newPage();
console.log({ spaceId: task.spaceId, page: page.label });
const css = await readFile(new URL('../popup.css', import.meta.url), 'utf8');
const html = (await readFile(new URL('../popup.html', import.meta.url), 'utf8')).replace('<link rel="stylesheet" href="popup.css">', `<style>${css}</style>`).replace(/<script src="[^"]+"><\/script>/g, '');
await page.goto('data:text/html,' + encodeURIComponent(html));
await page.evaluate(() => {
  const hints = { names: ['.view-source', '.flag', '.secret-panel', '#admin', '.debug-info'].map(name => ({ name, important: true, used: false })), unreadable: 0 };
  const state = { prefs: { passwords: true, reveal: true, unlock: true, textInputs: true, copy: true, urlBar: false }, zen: false, hints, css: false };
  const entries = Array.from({ length: 18 }, (_, index) => ({ tabId: 3, method: index % 2 ? 'POST' : 'GET', url: 'https://ctf.test/' + ['admin', 'api/login', 'api/profile', 'assets/main.js', 'config'][index % 5], status: [404, 200, 403, 304, 500][index % 5], type: index % 5 === 3 ? 'script' : 'xmlhttprequest', contentType: index % 5 === 0 ? 'text/html' : index % 5 === 3 ? 'application/javascript' : 'application/json', count: index + 1, duration: 23 + index * 7, headersKnown: true, headers: [] }));
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 3, url: 'https://ctf.test/challenge' }], reload: async () => {} },
    storage: { local: { set: async () => {}, remove: async () => {} } },
    runtime: { sendMessage: async () => ({ entries }) },
    scripting: { executeScript: async () => [{ frameId: 0, result: state }] }
  };
});
for (const file of ['network.js', 'popup.js']) await page.evaluate(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
await page.waitForFunction(() => !document.querySelector('#block').disabled);
const dimensions = await page.evaluate(() => ({ width: document.body.getBoundingClientRect().width, height: document.body.getBoundingClientRect().height, scrollHeight: document.body.scrollHeight, viewport: innerHeight }));
assert.equal(dimensions.width, 780); assert.equal(dimensions.height, 590); assert.ok(dimensions.scrollHeight <= 590, 'Use internal scrolling, not a tall popup');
assert.ok(await page.evaluate(() => document.querySelector('footer').textContent.includes('Made by Bach Phan ft. Codex with Love')));
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.method')).color), 'rgb(25, 131, 78)');
console.log(await page.snapshot());
try { console.log({ screenshot: await page.screenshot({ path: 'C:/Users/Bach Phan/Desktop/BKSec training/css-blocker/tests/popup-preview-31.png' }) }); }
catch { console.log('Screenshot service unavailable; DOM layout checks passed.'); }
await page.selectOption('#requestMethod', 'GET');
await page.fill('#requestStatus', '404');
await page.selectOption('#requestContent', 'html');
assert.ok(await page.evaluate(() => [...document.querySelectorAll('.request')].every(row => row.querySelector('.method').textContent === 'GET' && row.querySelector('.status-code').textContent === '404')));
assert.ok(await page.evaluate(() => [...document.querySelectorAll('.request .url')].every(node => node.textContent.startsWith('/') && !node.textContent.includes('ctf.test'))));
console.log('PASS: 780×590 popup, no outer scroll, footer, green methods, combined method/MIME/status filters and path-only rows.');
