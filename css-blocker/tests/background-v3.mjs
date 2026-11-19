import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const network = await readFile(new URL('../network.js', import.meta.url), 'utf8');
const source = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const imports = { 'network.js': network, 'policy.js': await readFile(new URL('../policy.js', import.meta.url), 'utf8'), 'i18n.js': await readFile(new URL('../i18n.js', import.meta.url), 'utf8') };
const memory = {};
let localSettings = {};
const tabURLs = new Map();
let navigation;
function boot() {
  const event = () => ({ addListener(fn, filter, options) { this.listener = fn; this.filter = filter; this.options = options; } });
  const chrome = {
    webRequest: Object.fromEntries(['onBeforeRequest', 'onBeforeSendHeaders', 'onResponseStarted', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred'].map(name => [name, event()])),
    tabs: { onRemoved: event(), onUpdated: event(), get: async id => ({ id, url: tabURLs.get(id) || 'https://ctf.test/challenge' }), update: async (id, args) => { navigation = { id, ...args }; } },
    contentSettings: { javascript: { clear: async () => {} } },
    storage: { local: { get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, localSettings[key]])) }, onChanged: event(), session: {
      get: async key => ({ [key]: JSON.parse(JSON.stringify(memory[key] || [])) }),
      remove: async key => { delete memory[key]; },
      set: async values => Object.assign(memory, JSON.parse(JSON.stringify(values)))
    } },
    runtime: { onMessage: event(), onInstalled: event(), getURL: path => 'chrome-extension://ctf/' + path }
  };
  const context = vm.createContext({ chrome, URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob, console,
    importScripts(...files) { for (const file of files) vm.runInContext(imports[file], context); }
  });
  vm.runInContext(source, context);
  return chrome;
}
let chrome = boot();
assert.equal(chrome.webRequest.onBeforeRequest.filter.types, undefined, 'Application capture is guarded consistently in every event handler');
const message = (data, sender = { url: 'chrome-extension://ctf/popup.html' }) => new Promise(resolve => chrome.runtime.onMessage.listener({ pageUrl: 'https://ctf.test/challenge', ...data }, sender, resolve));
for (const id of ['overlap1', 'overlap2']) chrome.webRequest.onBeforeRequest.listener({ tabId: 30, requestId: id, type: 'xmlhttprequest', method: 'GET', url: 'https://ctf.test/same', timeStamp: 1 });
for (const id of ['overlap1', 'overlap2']) chrome.webRequest.onBeforeSendHeaders.listener({ tabId: 30, requestId: id, type: 'xmlhttprequest', method: 'GET', url: 'https://ctf.test/same', timeStamp: 2, requestHeaders: [] });
const overlaps = (await message({ type: 'requests', tabId: 30 })).entries;
assert.equal(overlaps.length, 1); assert.equal(overlaps[0].count, 2, 'Late headers must not create another occurrence'); assert.equal(overlaps[0].rid, 'overlap2');
chrome.webRequest.onCompleted.listener({ tabId: 31, requestId: 'no-start', url: 'https://ctf.test/post', method: 'POST', statusCode: 200, timeStamp: 3 });
assert.equal((await message({ type: 'requests', tabId: 31 })).entries[0].body.missing, true, 'Completion-only POST must not be replayed with an invented empty body');
for (const [type, id] of [['main_frame', 'doc'], ['sub_frame', 'frame'], ['stylesheet', 'css'], ['script', 'js'], ['image', 'img'], ['font', 'font'], ['media', 'video'], ['object', 'object']]) {
  chrome.webRequest.onBeforeRequest.listener({ tabId: 20, requestId: id, type, method: 'GET', url: `https://ctf.test/${id}`, timeStamp: 1 });
  chrome.webRequest.onBeforeSendHeaders.listener({ tabId: 20, requestId: id, type, method: 'GET', url: `https://ctf.test/${id}`, timeStamp: 2, requestHeaders: [] });
  chrome.webRequest.onCompleted.listener({ tabId: 20, requestId: id, type, method: 'GET', url: `https://ctf.test/${id}`, timeStamp: 4, statusCode: 200, fromCache: true });
}
chrome.webRequest.onBeforeRequest.listener({ tabId: 20, requestId: 'failed', type: 'xmlhttprequest', method: 'GET', url: 'https://ctf.test/fail', timeStamp: 1 });
chrome.webRequest.onErrorOccurred.listener({ tabId: 20, requestId: 'failed', type: 'xmlhttprequest', method: 'GET', url: 'https://ctf.test/fail', timeStamp: 2, error: 'net::ERR_CONNECTION_REFUSED' });
const broader = (await message({ type: 'requests', tabId: 20 })).entries;
assert.equal(broader.length, 3, 'Keep documents, frames and API errors; skip static resources at every event');
assert.ok(!memory.requests.some(entry => ['css','js','img','font','video','object'].includes(entry.rid)), 'Static resources must never be persisted');
assert.equal(broader.find(entry => entry.rid === 'failed').status, 'net::ERR_CONNECTION_REFUSED');
assert.equal(broader.find(entry => entry.rid === 'doc').fromCache, true);
chrome.webRequest.onResponseStarted.listener({ tabId: 20, requestId: 'css', type: 'stylesheet', url: 'https://ctf.test/css', method: 'GET', statusCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css; charset=utf-8' }] });
assert.ok(!(await message({ type: 'requests', tabId: 20 })).entries.some(entry => entry.rid === 'css'), 'Response-only events cannot recreate static logs');
memory.requests.push({ tabId: 20, rid: 'legacy-css', type: 'stylesheet', url: 'https://ctf.test/old.css', method: 'GET' });
assert.ok(!(await message({ type: 'requests', tabId: 20 })).entries.some(entry => entry.rid === 'legacy-css'), 'Hide static logs saved by older versions');
chrome.webRequest.onBeforeRequest.listener({ tabId: 20, requestId: 'asset-api', type: 'xmlhttprequest', url: 'https://ctf.test/api/config.css', method: 'GET', timeStamp: 7 });
assert.ok((await message({ type: 'requests', tabId: 20 })).entries.some(entry => entry.rid === 'asset-api'), 'Preserve API requests regardless of filename suffix');
function capture(id, value = 'one') {
  const details = { tabId: 7, requestId: id, method: 'POST', url: 'https://ctf.test/api', timeStamp: Number(id) };
  chrome.webRequest.onBeforeRequest.listener({ ...details, requestBody: { raw: [{ bytes: new TextEncoder().encode(value).buffer }] } });
  chrome.webRequest.onBeforeSendHeaders.listener({ ...details, requestHeaders: [{ name: 'Authorization', value: 'Bearer ctf' }] });
}
capture('1'); capture('2');
chrome.webRequest.onCompleted.listener({ tabId: 7, requestId: '2', url: 'https://ctf.test/api', statusCode: 200 });
let response = await message({ type: 'requests', tabId: 7 });
assert.equal(response.entries.length, 1);
assert.equal(response.entries[0].count, 2);
assert.equal(response.entries[0].body.text, 'one');
assert.equal(response.entries[0].status, 200);
assert.equal(response.entries[0].headers[0].value, 'Bearer ctf');
const redirect = { tabId: 9, requestId: 'redirect', method: 'GET', timeStamp: 5 };
chrome.webRequest.onBeforeRequest.listener({ ...redirect, url: 'https://ctf.test/old' });
chrome.webRequest.onBeforeSendHeaders.listener({ ...redirect, url: 'https://ctf.test/old' });
chrome.webRequest.onBeforeRequest.listener({ ...redirect, url: 'https://ctf.test/new' });
chrome.webRequest.onBeforeSendHeaders.listener({ ...redirect, url: 'https://ctf.test/new' });
chrome.webRequest.onCompleted.listener({ ...redirect, url: 'https://ctf.test/new', statusCode: 200 });
const redirects = (await message({ type: 'requests', tabId: 9 })).entries;
assert.equal(redirects.find(entry => entry.url.endsWith('/new')).status, 200, 'Redirect status belongs to destination URL');
assert.equal(redirects.find(entry => entry.url.endsWith('/old')).status, undefined);
assert.equal((await message({ type: 'requests', tabId: 8 })).entries.length, 0);
let leaked = false;
chrome.runtime.onMessage.listener({ type: 'requests', tabId: 7 }, { tab: { id: 7 }, url: 'https://ctf.test' }, () => { leaked = true; });
assert.equal(leaked, false, 'Content scripts cannot read auth-bearing network logs');
await message({ type: 'navigate', url: 'https://ctf.test/%252F' }, { tab: { id: 7 } });
assert.equal(navigation.url, 'https://ctf.test/%252F');
const rawURL = 'https://ctf.test/đường dẫn?q=%252F&text=a b';
await message({ type: 'navigate', url: rawURL }, { tab: { id: 7 } });
assert.equal(navigation.url, rawURL, 'Do not encode the navigation argument');
assert.equal((await message({ type: 'address', url: new URL(rawURL).href }, { tab: { id: 7 } })).raw, rawURL, 'Preserve original text across navigation/reload');
assert.equal((await message({ type: 'address', url: 'https://ctf.test/other' }, { tab: { id: 7 } })).raw, 'https://ctf.test/other');
assert.ok((await message({ type: 'navigate', url: 'javascript:alert(1)' }, { tab: { id: 7 } })).error);
chrome = boot();
assert.equal((await message({ type: 'requests', tabId: 7 })).entries.length, 1, 'Records survive worker restart');
capture('3', 'two');
assert.equal((await message({ type: 'requests', tabId: 7 })).entries.length, 2);
await message({ type: 'clearRequests', tabId: 7 });
assert.equal((await message({ type: 'requests', tabId: 7 })).entries.length, 0);
for (const detail of [{ tabId: 20, requestId: 'third-party', url: 'https://cdn.other.test/file.js' }, { tabId: -1, requestId: 'sw', url: 'https://ctf.test/sw-api', initiator: 'https://ctf.test' }, { tabId: -1, requestId: 'other-sw', url: 'https://ctf.test/other-api', initiator: 'https://other.test' }]) chrome.webRequest.onBeforeRequest.listener({ ...detail, method: 'GET', type: 'xmlhttprequest', timeStamp: 5 });
const scoped = (await message({ type: 'requests', tabId: 20 })).entries;
assert.ok(scoped.some(entry => entry.rid === 'sw')); assert.ok(!scoped.some(entry => ['third-party', 'other-sw'].includes(entry.rid)), 'Only current hostname and relevant tab/background origin are shown');
function settings(next) {
  const changes = Object.fromEntries(Object.entries(next).map(([key, newValue]) => [key, { newValue }]));
  localSettings = { ...localSettings, ...next }; chrome.storage.onChanged.listener?.(changes, 'local');
}
settings({ disabledEndpoints: ['ctf.test/paused'] });
tabURLs.set(42, 'https://ctf.test/paused?x=1');
for (const detail of [{ type: 'main_frame', url: 'https://ctf.test/paused?x=1' }, { type: 'xmlhttprequest', url: 'https://ctf.test/api/private' }]) chrome.webRequest.onBeforeRequest.listener({ ...detail, tabId: 42, requestId: detail.url, method: 'GET', timeStamp: 100 });
await message({ type: 'requests', tabId: 42, pageUrl: 'https://ctf.test/paused?x=1' });
assert.equal((memory.requests || []).filter(entry => entry.tabId === 42).length, 0, 'Excluded endpoint must not record the document or its API requests');
settings({ disabledEndpoints: [] });
settings({ disabledEndpoints: ['ctf.test/paused'] });
chrome.tabs.onUpdated.listener(44, { url: 'https://ctf.test/paused' });
chrome.webRequest.onBeforeRequest.listener({ tabId: 44, requestId: 'navigation-race', type: 'xmlhttprequest', url: 'https://ctf.test/private', method: 'GET', timeStamp: 100 });
chrome.tabs.onUpdated.listener(44, { url: 'https://ctf.test/open' });
chrome.webRequest.onBeforeSendHeaders.listener({ tabId: 44, requestId: 'navigation-race', url: 'https://ctf.test/private', method: 'GET', requestHeaders: [] });
await message({ type: 'requests', tabId: 44, pageUrl: 'https://ctf.test/open' });
assert.ok(!memory.requests.some(entry => entry.rid === 'navigation-race'), 'Keep original excluded page scope across navigation and header fallback');
settings({ disabledEndpoints: [] });
chrome.webRequest.onBeforeRequest.listener({ type: 'xmlhttprequest', url: 'https://ctf.test/api/private', tabId: 42, requestId: 'resumed', method: 'GET', timeStamp: 101 });
assert.ok((await message({ type: 'requests', tabId: 42, pageUrl: 'https://ctf.test/paused' })).entries.some(entry => entry.rid === 'resumed'));
settings({ disabledSites: ['ctf.test'] });
chrome.webRequest.onBeforeRequest.listener({ type: 'xmlhttprequest', url: 'https://other.test/request-from-paused-site', tabId: 43, requestId: 'site-off', method: 'GET', timeStamp: 102 });
assert.equal((await message({ type: 'requests', tabId: 43 })).entries.length, 0);
assert.equal((memory.requests || []).filter(entry => entry.rid === 'site-off').length, 0, 'Site exclusion also stops cross-origin requests made by the excluded page');
console.log('PASS: request event pipeline, dedup, auth headers, response status, per-tab scope, worker restart, clear, message authorization and navigation.');
chrome.tabs.onUpdated.listener(67, { url: 'https://ctf.test/paused' });
chrome.webRequest.onBeforeRequest.listener({ tabId: 67, requestId: 'settings-race', type: 'xmlhttprequest', url: 'https://ctf.test/private', method: 'GET', timeStamp: 103 });
settings({ disabledSites: [] });
chrome.webRequest.onBeforeSendHeaders.listener({ tabId: 67, requestId: 'settings-race', url: 'https://ctf.test/private', method: 'GET', requestHeaders: [] });
await message({ type: 'requests', tabId: 67 });
assert.ok(!memory.requests.some(entry => entry.rid === 'settings-race'), 'Requests issued while paused stay excluded even when enabled before queue drains');
console.log('PASS: exclusion settings snapshot survives immediate re-enable and later header events.');
