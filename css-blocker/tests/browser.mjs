// Run: ego-browser nodejs -e "await import('file:///ABSOLUTE/PATH/tests/browser.mjs')"
// A real DOM check: removing the observer or startup storage check must fail.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
let source = '';
try { source = await readFile(new URL('../content.js', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const task = await taskSpace('CTF simple verification');
console.log({ spaceId: task.spaceId });
const page = task.page('p1');
const fixture = 'data:text/html,' + encodeURIComponent('<!doctype html><style>p{color:rgb(255,0,0)}</style><p id="target" style="font-size:40px">CSS test</p><div id="host"></div>');
async function load(saved) {
  await page.goto(fixture);
  await page.evaluate(({ source, saved }) => {
    globalThis.chrome = { storage: { local: { get: async key => ({ [key]: saved }) } } };
    (0, eval)(source);
  }, { source, saved });
}
await load(false);
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('p')).color), 'rgb(255, 0, 0)', 'Default must preserve CSS');
await page.evaluate(() => globalThis.CSSBlocker?.enable());
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('p')).fontSize), '16px', 'Weak mode must remove inline CSS');
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('p')).color), 'rgb(0, 0, 0)', 'Weak mode must remove style tags');
await page.evaluate(() => {
  const sheet = document.createElement('style'); sheet.textContent = 'p{color:red}'; document.head.append(sheet);
  document.querySelector('p').style.fontSize = '50px';
  const root = document.querySelector('#host').attachShadow({ mode: 'open' });
  root.innerHTML = '<style>span{color:red}</style><span style="font-size:40px">Shadow</span>';
  const adopted = new CSSStyleSheet(); adopted.replaceSync('p{color:red}'); document.adoptedStyleSheets = [adopted];
});
await page.waitForFunction(() => document.adoptedStyleSheets.length === 0 && !document.querySelector('#host').shadowRoot.querySelector('style'), undefined, { timeout: 5000 });
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('p')).fontSize), '16px', 'New inline CSS must remain blocked');
await load(false);
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('p')).color), 'rgb(255, 0, 0)', 'Weak must end on reload');
await load(true);
await page.waitForFunction(() => getComputedStyle(document.querySelector('p')).color === 'rgb(0, 0, 0)', undefined, { timeout: 5000 });
await load(true);
await page.waitForFunction(() => getComputedStyle(document.querySelector('p')).color === 'rgb(0, 0, 0)', undefined, { timeout: 5000 });
await load(false);
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('p')).color), 'rgb(255, 0, 0)', 'Restore must preserve CSS on next load');
console.log('PASS: default, weak, dynamic CSS, open shadow DOM, adopted sheets, strong across navigation, restore.');
