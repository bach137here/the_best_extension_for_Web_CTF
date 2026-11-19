import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const task = await taskSpace('CTF simple verification');
const page = task.page('p1');
console.log({ spaceId: task.spaceId });
await page.goto('data:text/html,' + encodeURIComponent('<!doctype html><style>body{margin:0}main{min-height:1800px}</style><main id="main"><form><label>First content<input id="first"></label></form><pre>Output</pre></main>'));
await page.evaluate(() => {
  const prefs = { passwords: false, reveal: false, unlock: false, textInputs: false, copy: false, urlBar: false };
  const listeners = [];
  globalThis.chrome = { storage: { local: {
    get: async () => ({ prefs }),
    set: async values => { for (const listener of listeners) listener(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), 'local'); }
  }, onChanged: { addListener: fn => listeners.push(fn) } }, runtime: { sendMessage: async () => ({}) } };
});
for (const file of ['dom-guard.js', 'content.js', 'page.js']) await page.evaluate(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'));
await page.evaluate(async () => { await globalThis.CTFPage.ready; });
const baseline = await page.evaluate(() => document.querySelector('#main').getBoundingClientRect().top);
async function assertClear(label) {
  const rects = await page.evaluate(() => {
    const bar = document.querySelector('ctf-toolbar').getBoundingClientRect();
    return { barBottom: bar.bottom, contentTop: document.querySelector('#main').getBoundingClientRect().top };
  });
  assert.ok(rects.contentTop >= rects.barBottom - .5, `${label}: content top ${rects.contentTop} must be below toolbar bottom ${rects.barBottom}`);
}
await page.evaluate(() => globalThis.CTFPage.configure({ urlBar: true }));
await assertClear('URL only');
await page.evaluate(() => { globalThis.CTFPage.configure({ urlBar: false }); globalThis.CTFPage.setZen(true); });
await assertClear('Zen only / Tắt Zen row');
console.log(await page.snapshot());
await page.click('loc=role:button[name="Tắt Zen"]');
assert.equal(await page.evaluate(() => !!document.querySelector('ctf-toolbar')), false);
assert.equal(await page.evaluate(() => document.querySelector('#main').getBoundingClientRect().top), baseline, 'Turning both off restores original spacing');
await page.evaluate(() => { globalThis.CTFPage.configure({ urlBar: true }); globalThis.CTFPage.setZen(true); });
await assertClear('URL and Zen');
await page.evaluate(() => globalThis.CTFPage.setZen(false));
await assertClear('URL after turning Zen off');
await page.evaluate(() => globalThis.CSSBlocker.enable());
await assertClear('CSS blocked');
await page.evaluate(() => globalThis.CTFPage.configure({ urlBar: false }));
assert.equal(await page.evaluate(() => !!document.querySelector('ctf-toolbar')), false);
console.log('PASS: URL-only, Zen-only, both modes, Zen off, CSS blocking and clean removal without overlay.');
