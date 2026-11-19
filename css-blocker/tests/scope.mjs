import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const source = await readFile(new URL('../scope.js', import.meta.url), 'utf8');
const policy = await readFile(new URL('../policy.js', import.meta.url), 'utf8');
async function fixture(url, settings = {}, framed = false) {
  let reloads = 0, tick, listener;
  const context = vm.createContext({ URL, location: { href: url, reload() { reloads++; } },
    setInterval(fn) { tick = fn; },
    chrome: { storage: { local: { get: async () => settings }, onChanged: { addListener(fn) { listener = fn; } } },
      runtime: { sendMessage: async () => ({ url: 'https://ctf.test/paused' }) } }
  });
  context.top = framed ? { get location() { throw new Error('cross-origin'); } } : context;
  vm.runInContext(policy, context); vm.runInContext(source, context);
  await context.CTFScope.ready;
  return { context, tick: () => tick(), change: changes => listener(changes, 'local'), reloads: () => reloads };
}
const off = await fixture('https://ctf.test/paused?x=1', { disabledEndpoints: ['ctf.test/paused'] });
assert.equal(off.context.CTFScope.disabled, true);
// Paused pages must skip page helpers before touching DOM APIs.
vm.runInContext(await readFile(new URL('../page.js', import.meta.url), 'utf8'), off.context);
await off.context.CTFPageReady; assert.equal(off.context.CTFPage, undefined);
off.change({ disabledEndpoints: { newValue: [] } });
assert.equal(off.reloads(), 1); assert.equal(off.context.CTFScope.disabled, false);
off.change({ disabledSites: { newValue: ['ctf.test'] } });
assert.equal(off.reloads(), 1, 'Only one pending reload');
const active = await fixture('https://ctf.test/open', { disabledEndpoints: ['ctf.test/paused'] });
active.context.location.href = 'https://ctf.test/open?q=2'; active.tick(); assert.equal(active.reloads(), 0);
active.context.location.href = 'https://ctf.test/paused#flag'; active.tick();
assert.equal(active.reloads(), 1); assert.equal(active.context.CTFScope.disabled, true);
const frame = await fixture('https://frame.test/', { disabledEndpoints: ['ctf.test/paused'] }, true);
assert.equal(frame.context.CTFScope.disabled, true, 'Cross-origin frames inherit top-page exclusion');
console.log('PASS: paused startup, page helper gate, re-enable reload, SPA boundary and cross-origin frame scope.');
