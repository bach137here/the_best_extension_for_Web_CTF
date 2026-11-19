import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const task = await taskSpace('CTF simple verification');
console.log({ spaceId: task.spaceId });
const page = task.page('p1');
const html = `<!doctype html><style>.view-source{color:red}.flag-used{color:green}.container{margin:0}.hidden{display:none}</style>
<nav id="static">Static navigation</nav><p class="flag-used">Flag CSS exists</p>
<form><label>Password<input id="pw" type="password" value="secret" required readonly maxlength="3"></label><fieldset disabled><input id="special" type="number" min="1"></fieldset><input id="secret" type="hidden" value="flag"></form>
<div id="liveOutput">Waiting</div><pre id="output">Output here</pre><dialog>Hidden dialog</dialog>
<div class="code-formatter-toolbar"><div id="formatter-menu" style="display:none"><input id="formatter-field" type="hidden" required readonly value="internal"></div></div>
<div class="cm-editor"><textarea id="editor-input" style="opacity:0" readonly>internal editor</textarea></div>
<div id="late-root"><input id="late-field" type="hidden"></div>`;
await page.goto('data:text/html,' + encodeURIComponent(html));
await page.evaluate(() => { globalThis.chrome = { storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } }, runtime: { sendMessage: async () => ({ ok: true }) } }; });
for (const file of ['hints.js', 'content.js', 'dom-guard.js', 'page.js']) {
  let source = '';
  try { source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await page.evaluate(source => { (0, eval)(source); }, source);
}
assert.equal(await page.evaluate(() => !!globalThis.CTFPage), true, 'Simple page controller must initialize');
await page.waitForFunction(() => document.querySelector('#pw').type === 'text');
assert.equal(await page.evaluate(() => document.querySelector('#secret').type), 'text');
assert.equal(await page.evaluate(() => document.querySelector('#special').type), 'text');
assert.equal(await page.evaluate(() => document.querySelector('#special').matches(':disabled')), false);
assert.equal(await page.evaluate(() => document.querySelector('#formatter-field').type), 'hidden');
assert.equal(await page.evaluate(() => document.querySelector('#formatter-field').required), true);
assert.equal(await page.evaluate(() => document.querySelector('#formatter-field').readOnly), true);
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#formatter-menu')).display), 'none');
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#editor-input')).opacity), '0');
await page.evaluate(() => document.querySelector('#late-root').setAttribute('data-extension-id', 'sample'));
await page.waitForFunction(() => document.querySelector('#late-field').type === 'hidden');
const hints = await page.evaluate(() => globalThis.CTFHints.list());
assert.ok(hints.names.some(entry => entry.name === '.view-source' && !entry.used && entry.important));
assert.ok(hints.names.some(entry => entry.name === '.flag-used' && entry.used && entry.important));
assert.equal(hints.names.find(entry => entry.name === '.container').important, false);
await page.evaluate(() => globalThis.CTFPage.configure({ passwords: false }));
assert.equal(await page.evaluate(() => document.querySelector('#pw').type), 'password', 'Unchecking restores masking without refresh');
assert.equal(await page.evaluate(() => document.querySelector('#special').matches(':disabled')), false, 'Other checked helpers stay on');
await page.evaluate(() => globalThis.CTFPage.configure({ urlBar: true }));
assert.equal(await page.evaluate(() => !!document.querySelector('ctf-toolbar')?.shadowRoot.querySelector('input')), true);
await page.evaluate(() => globalThis.CTFPage.setZen(true));
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#static')).display), 'none');
assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('form')).display), 'none');
assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#output')).display), 'none');
await page.evaluate(() => { document.querySelector('#liveOutput').textContent = 'Solved dynamic output'; });
await page.waitForFunction(() => getComputedStyle(document.querySelector('#liveOutput')).display !== 'none');
await page.evaluate(() => globalThis.CSSBlocker.enable());
await page.waitForFunction(() => ![...document.querySelectorAll('head style')].some(node => node.textContent.includes('.view-source')));
assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#static')).display), 'none', 'Zen survives CSS blocking');
assert.ok((await page.evaluate(() => globalThis.CTFHints.list())).names.some(entry => entry.name === '.view-source'), 'Hints survive CSS stripping');
assert.equal(await page.evaluate(() => !!document.querySelector('ctf-toolbar').shadowRoot.querySelector('style')), true);
await page.evaluate(() => globalThis.CTFPage.setZen(false));
assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#static')).display), 'none', 'Zen off restores static content');
console.log('PASS: defaults, independent checkboxes, CSS hint names, virtual URL bar, Zen I/O, dynamic output, CSS+Zen compatibility.');
console.log(await page.snapshot());
