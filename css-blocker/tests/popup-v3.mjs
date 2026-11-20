import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
function element(tag = '') {
  return { id: tag.match(/\bid="([^"]+)"/)?.[1], dataset: { pref: tag.match(/data-pref="([^"]+)"/)?.[1] },
    disabled: tag.includes('disabled'), checked: tag.includes('checked'), value: tag.includes('id="hintFilter"') ? 'ctf' : /id="request(?:Type|Method|Content)"/.test(tag) ? 'all' : '', textContent: '', children: [],
    addEventListener(event, fn) { this[event] = fn; }, append(...children) { this.children.push(...children); }, replaceChildren() { this.children = []; },
    setAttribute(key, value) { this[key] = value; }, focus() {}, select() {}, set innerHTML(_) { throw new Error('Never render page data as HTML'); }
  };
}
const elements = [...html.matchAll(/<(?:button|input|select|p|ul|div|span|textarea)[^>]*>/g)].map(([tag]) => element(tag));
const find = id => elements.find(entry => entry.id === id);
const prefs = { passwords: true, reveal: true, unlock: true, textInputs: true, copy: true, urlBar: false };
const hints = { names: [{ name: '.view-source', important: true, used: false }, { name: '.container', important: false, used: true }], unreadable: 0 };
const stored = {};
let css = false, reloads = 0, copied;
let requests = [{ method: 'POST', url: 'https://ctf.test/api', tabId: 3, type: 'xmlhttprequest', contentType: 'application/json', status: 200, count: 2, body: { text: '{"x":1}' }, headers: [] }];
const page = vm.createContext({
  CSSBlocker: { enable() { css = true; } }, CTFHints: { list: () => hints },
  CTFPage: { ready: Promise.resolve(), state: () => ({ prefs, hints, css, zen: false }) }
});
const context = vm.createContext({
  URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob, setInterval() {},
  document: { querySelector: selector => find(selector.slice(1)), querySelectorAll: selector => elements.filter(entry => selector === '[data-pref]' ? entry.dataset.pref : entry.disabled), createElement: () => element() },
  navigator: { clipboard: { writeText: async value => { copied = value; } } },
  chrome: {
    tabs: { query: async () => [{ id: 3, url: 'https://ctf.test/challenge' }], reload: async id => { assert.equal(id, 3); reloads++; } },
    storage: { local: { get: async keys => Object.fromEntries(keys.map(key => [key, stored[key]])), set: async value => Object.assign(stored, value), remove: async key => { delete stored[key]; } } },
    runtime: { sendMessage: async message => { if (message.type === 'clearRequests') requests = []; return { entries: requests }; } },
    scripting: { executeScript: async options => {
      assert.equal(options.target.tabId, 3);
      if (options.files) return [{ frameId: 0 }];
      page.args = options.args || [];
      return [{ frameId: 0, result: await vm.runInContext(`(${options.func.toString()})(...args)`, page) }];
    } }
  }
});
vm.runInContext(await readFile(new URL('../body-format.js', import.meta.url), 'utf8'), context);
vm.runInContext(await readFile(new URL('../network.js', import.meta.url), 'utf8'), context);
vm.runInContext(await readFile(new URL('../policy.js', import.meta.url), 'utf8'), context);
vm.runInContext(await readFile(new URL('../popup.js', import.meta.url), 'utf8'), context);
await new Promise(resolve => setImmediate(resolve));
assert.equal(find('block').disabled, false);
assert.equal(find('exportHeaders').value, 'minimal');
assert.equal(find('groupEndpoints').checked, true);
assert.deepEqual(find('hints').children.map(entry => entry.textContent), ['.view-source'], 'Default hint view hides utility noise');
await find('block').click(); assert.equal(css, true); assert.equal(stored['strong:ctf.test'], true);
await find('restore').click(); assert.equal(stored['strong:ctf.test'], undefined); assert.equal(reloads, 1);
const password = elements.find(entry => entry.dataset.pref === 'passwords'); password.checked = false;
await password.change(); assert.equal(stored.prefs.passwords, false); assert.equal(stored.prefs.unlock, true);
find('urlBar').checked = true; await find('urlBar').change(); assert.equal(stored.prefs.urlBar, true);
find('zen').checked = true; await find('zen').change(); assert.equal(stored['zen:ctf.test'], true);
const row = find('requests').children[0];
assert.equal(row.children[0].children[0].textContent, 'POST');
assert.equal(row.children[0].children[0].className, 'method');
assert.equal(row.children[0].children[1].children[0].textContent, '/api', 'Show path without hostname');
assert.ok(!row.children[2].textContent.includes('ctf.test'), 'Do not repeat hostname in row metadata');
assert.equal(row.children[1].hidden, true);
row.children[0].children[1].children[1].click();
assert.equal(row.children[1].hidden, false);
assert.equal(row.children[1].textContent, '/api');
row.children[0].children[1].children[1].click();
assert.equal(row.children[1].hidden, true);
await row.children[0].children[3].children[0].click(); await new Promise(resolve => setImmediate(resolve));
assert.ok(copied.startsWith('curl ')); assert.ok(copied.includes('--data-raw'));
await row.children[0].children[3].children[1].click(); await new Promise(resolve => setImmediate(resolve));
assert.equal(row.children[0].children[3].children[1].textContent, 'cURL CMD');
assert.ok(copied.startsWith('curl.exe ')); assert.ok(copied.includes(' ^\r\n'));
await row.children[0].children[3].children[2].click(); await new Promise(resolve => setImmediate(resolve));
assert.ok(copied.startsWith('POST /api HTTP/1.1\r\n'));
find('requestMethod').value = 'GET'; find('requestMethod').change(); assert.equal(find('requests').children[0].className, 'empty');
find('requestMethod').value = 'all'; find('requestMethod').change();
find('requestContent').value = 'image'; find('requestContent').change(); assert.equal(find('requests').children[0].className, 'empty');
find('requestContent').value = 'json'; find('requestContent').change(); assert.equal(find('requests').children[0].className, 'request');
find('requestStatus').value = '4xx'; find('requestStatus').input(); assert.equal(find('requests').children[0].className, 'empty');
find('requestStatus').value = '200'; find('requestStatus').input(); assert.equal(find('requests').children[0].className, 'request');
find('requestStatus').value = ''; find('requestStatus').input();
find('hintFilter').value = 'all'; find('hintFilter').change(); assert.equal(find('hints').children.length, 2);
requests.push({ method: 'GET', url: 'https://ctf.test/app.js', type: 'script', count: 1 });
await find('refresh').click();
assert.equal(find('requestCount').textContent, 1, 'Exclude static resources from old logs and request counts');
await find('clear').click(); assert.equal(find('requestCount').textContent, 0);
requests = [
  { method:'POST',url:'https://ctf.test/login?q=first',type:'xmlhttprequest',count:2,time:1,body:{text:'first-body'},headers:[{name:'User-Agent',value:'browser'}] },
  { method:'POST',url:'https://ctf.test/login?q=second',type:'xmlhttprequest',count:1,time:2,body:{text:'second-body'},headers:[{name:'User-Agent',value:'browser'}] }
];
find('requestContent').value = 'all'; await find('refresh').click();
assert.equal(find('requestCount').textContent,1,'Group different bodies and queries into one endpoint');
let groupedRow = find('requests').children[0];
await groupedRow.children[0].children[3].children[0].click();
assert.ok(copied.includes('second-body')); assert.ok(!copied.includes('User-Agent'));
find('exportHeaders').value='full'; await find('exportHeaders').change(); assert.equal(stored.exportHeaders,'full');
await groupedRow.children[0].children[3].children[0].click(); assert.ok(copied.includes('User-Agent'));
const chooser=groupedRow.children[1].children[0]; chooser.value='1'; chooser.change();
await groupedRow.children[0].children[3].children[2].click(); assert.ok(copied.endsWith('first-body')); assert.ok(copied.includes('q=first'));
await find('refresh').click(); groupedRow=find('requests').children[0];
await groupedRow.children[0].children[3].children[2].click(); assert.ok(copied.endsWith('first-body'),'Retain variant selection after refresh');
find('groupEndpoints').checked=false; await find('groupEndpoints').change();
assert.equal(find('requestCount').textContent,2); assert.equal(stored.groupEndpoints,false);
console.log('PASS: minimal popup, CSS buttons, default helpers/checkbox save, URL/Zen toggles, CSS filters, curl/raw buttons and clear.');
