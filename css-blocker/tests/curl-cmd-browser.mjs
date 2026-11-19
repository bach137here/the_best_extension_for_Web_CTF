import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const task = await taskSpace('CTF simple verification');
const page = task.page('p1');
console.log({ spaceId: task.spaceId });
const css = await readFile(new URL('../popup.css', import.meta.url), 'utf8');
const html = (await readFile(new URL('../popup.html', import.meta.url), 'utf8')).replace('<link rel="stylesheet" href="popup.css">', `<style>${css}</style>`).replace(/<script src="[^"]+"><\/script>/g, '');
await page.goto('data:text/html,' + encodeURIComponent(html));
await page.evaluate(() => {
  const state = { prefs: { passwords: true, reveal: true, unlock: true, textInputs: true, copy: true, urlBar: false }, zen: false, hints: { names: [], unreadable: 0 }, css: false };
  const entry = { method: 'POST', url: 'https://ctf.test/api', tabId: 7, count: 1, headers: [{ name: 'Content-Type', value: 'application/json' }], body: { text: '{"x":1}' } };
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { globalThis.lastCopied = text; } } });
  globalThis.chrome = { tabs: { query: async () => [{ id: 7, url: 'https://ctf.test/' }] }, storage: { local: {} }, runtime: { sendMessage: async () => ({ entries: [entry] }) }, scripting: { executeScript: async () => [{ frameId: 0, result: state }] } };
});
for (const file of ['network.js', 'popup.js']) await page.evaluate(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
await page.waitForFunction(() => !!document.querySelector('[data-format=curlCmd]'));
const positions = await page.evaluate(() => {
  const bash = document.querySelector('[data-format=curl]').getBoundingClientRect();
  const cmd = document.querySelector('[data-format=curlCmd]').getBoundingClientRect();
  return { bashBottom: bash.bottom, bashLeft: bash.left, cmdTop: cmd.top, cmdLeft: cmd.left, scroll: document.body.scrollHeight };
});
assert.ok(positions.cmdTop >= positions.bashBottom);
assert.ok(Math.abs(positions.cmdLeft - positions.bashLeft) < .5);
assert.ok(positions.scroll <= 590);
console.log(await page.snapshot());
await page.click('[data-format=curlCmd]');
assert.ok(await page.evaluate(() => globalThis.lastCopied.startsWith('curl.exe ') && globalThis.lastCopied.includes(' ^\r\n')));
console.log('PASS: cURL CMD is below cURL Bash, popup stays compact and CMD button copies the Windows command.');
