import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
let source = '';
try { source = await readFile(new URL('../network.js', import.meta.url), 'utf8'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const context = vm.createContext({ URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob });
vm.runInContext(source, context);
assert.ok(context.CTFNetwork, 'Request capture and export helpers must exist');
const api = context.CTFNetwork;
const request = { tabId: 7, method: 'POST', url: 'https://ctf.test/api?q=%252F', headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Authorization', value: "Bearer a'b" }], body: { text: '{"x":"one"}' }, time: 1 };
let list = api.upsert([], request);
list = api.upsert(list, { ...request, time: 2, headers: [{ name: 'X-Nonce', value: 'new' }] });
assert.equal(list.length, 1, 'Changing headers must not duplicate endpoint/body');
assert.equal(list[0].count, 2);
assert.equal(list[0].time, 2);
list = api.upsert(list, { ...request, body: { text: '{"x":"two"}' } });
assert.equal(list.length, 2, 'Different bodies must remain separate');
list = api.upsert(list, { ...request, tabId: 8 });
assert.equal(list.length, 3, 'Tabs must have separate records');
const curl = api.curl(request);
assert.ok(curl.includes('--path-as-is'));
assert.ok(curl.includes('--globoff'));
assert.ok(curl.includes('https://ctf.test/api?q=%252F'));
assert.ok(curl.includes("a'\"'\"'b"), 'Shell quote single quotes safely');
assert.ok(curl.includes('--data-raw'));
assert.ok(api.curl({ ...request, body: { text: '@/etc/passwd' } }).includes("--data-raw '@/etc/passwd'"), 'Text body must never become a local file read');
assert.throws(() => api.curl({ ...request, body: { text: 'a=1', approximate: true }, headers: [{ name: 'Content-Type', value: 'multipart/form-data; boundary=x' }] }), /multipart|form/i);
const raw = api.raw(request);
assert.ok(raw.startsWith('POST /api?q=%252F HTTP/1.1\r\nHost: ctf.test\r\n'));
assert.ok(raw.endsWith('\r\n\r\n{"x":"one"}'));
assert.equal(api.body({ raw: [{ bytes: new TextEncoder().encode('hello').buffer }] }).text, 'hello');
assert.ok(api.body({ formData: { a: ['1', '2'] } }).approximate, 'Parsed form bodies must be marked reconstructed');
assert.throws(() => api.curl({ ...request, body: { text: 'partial', truncated: true } }), /body/i, 'Incomplete payload cannot be exported as faithful curl');
const binary = api.body({ raw: [{ bytes: new Uint8Array([0, 255, 17]).buffer }] });
assert.ok(binary.base64);
assert.ok(api.curl({ ...request, body: binary }).includes('base64 --decode'));
assert.throws(() => api.raw({ ...request, body: binary }), /binary/i);
console.log('PASS: dedup, per-tab isolation, payload distinctions, curl quoting, raw HTTP, form/binary/truncated body handling.');
const noisy = { ...request, headers: [...request.headers,
  { name: 'Cookie', value: 'session=demo' }, { name: 'X-CSRF-Token', value: 'demo-token' },
  { name: 'Origin', value: 'https://ctf.test' }, { name: 'Referer', value: 'https://ctf.test/login' },
  { name: 'Accept', value: 'application/json' }, { name: 'Content-Encoding', value: 'gzip' },
  { name: 'User-Agent', value: 'demo-browser' }, { name: 'Accept-Encoding', value: 'gzip' },
  { name: 'Accept-Language', value: 'en' }, { name: 'Sec-Fetch-Site', value: 'same-origin' },
  { name: 'Sec-CH-UA-Platform', value: 'Windows' }, { name: 'Priority', value: 'u=1' },
  { name: 'Connection', value: 'keep-alive' }, { name: 'Host', value: 'wrong.test' }, { name: 'Content-Length', value: '9999' }
] };
const snapshot = JSON.stringify(noisy);
for (const format of ['curl','curlCmd','raw']) {
  const minimal = api[format](noisy), full = api[format](noisy, 'full');
  for (const name of ['Content-Type','Authorization','Cookie','X-CSRF-Token','Origin','Referer','Accept','Content-Encoding']) assert.ok(minimal.includes(name + ':'), `${format}: preserve ${name}`);
  for (const name of ['User-Agent','Accept-Encoding','Accept-Language','Sec-Fetch-Site','Sec-CH-UA-Platform','Priority','Connection']) {
    assert.ok(!minimal.includes(name + ':'), `${format}: strip ${name} in minimal mode`);
    assert.ok(full.includes(name + ':'), `${format}: restore ${name} in full mode`);
  }
  assert.ok(!full.includes('wrong.test')); assert.ok(!full.includes('9999'));
  if (format !== 'raw') { assert.ok(!minimal.includes('--compressed')); assert.ok(full.includes('--compressed')); }
  else { assert.equal((minimal.match(/^Host:/gm) || []).length, 1); assert.ok(minimal.includes('Content-Length: 11\r\n')); }
}
assert.equal(JSON.stringify(noisy), snapshot, 'Export choices must not mutate the captured request');
const variants = [{ ...request, url:'https://ctf.test/login?a=1', time:1, count:2 }, { ...request, url:'https://ctf.test/login?a=2', body:{text:'new body'}, time:2, count:3 }];
const grouped = api.groupEndpoints([...variants, { ...request, url:'https://ctf.test/login', method:'GET', count:1 }, { ...request, url:'https://ctf.test/login/reset', count:1 }, { ...request, url:'http://ctf.test/login', count:1 }]);
assert.equal(grouped.length,4); assert.equal(grouped[0].count,5); assert.equal(grouped[0].variants.length,2);
assert.equal(grouped[0].variants[0].body.text,'new body','Newest variant is the default');
assert.equal(variants.length,2); assert.equal(variants[0].count,2,'Grouping must not mutate or delete recorded bodies');
assert.notEqual(api.identity({...request,body:undefined}),api.identity({...request,body:{text:''}}));
assert.notEqual(api.identity({...request,body:{text:'AA=='}}),api.identity({...request,body:{base64:'AA=='}}));
console.log('PASS: minimal/full headers in all exporters, transport headers, retained auth/custom headers, and endpoint grouping without payload loss.');
