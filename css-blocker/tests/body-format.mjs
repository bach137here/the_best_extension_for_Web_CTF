import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const context = vm.createContext({ TextDecoder, btoa });
vm.runInContext(await readFile(new URL('../body-format.js', import.meta.url), 'utf8'), context);
const { format, isHTML, preview } = context.CTFBody;
const utf8 = new TextEncoder();
assert.equal(preview(utf8.encode('{"ok":true}'), 'application/json').body, '{"ok":true}');
assert.equal(preview(utf8.encode('<html>blocked</html>'), 'text/plain').html, true);
assert.equal(preview(utf8.encode('<div>blocked</div>'), 'text/html').body, '');
assert.equal(preview(Uint8Array.of(0, 255, 17), 'application/octet-stream').body, '[base64]\nAP8R');
assert.equal(preview(Uint8Array.of(255), 'text/plain').body, '[base64]\n/w==');
assert.equal(preview(utf8.encode('a\0b'), 'text/plain').body, '[base64]\nYQBi');
assert.equal(preview(Uint8Array.of(104, 0, 105, 0), 'text/plain; charset=utf-16le').body, 'hi');
assert.equal(preview(utf8.encode('hello'), 'text/plain; charset=not-a-charset').body, 'hello');
const json = '{"name":"guest","items":[1,{"ok":true}],"markup":"<script>alert(1)</script>"}';
for (const type of ['', 'text/plain', 'application/json', 'application/problem+json; charset=utf-8']) {
  assert.equal(format(json, type), JSON.stringify(JSON.parse(json), null, 2));
}
for (const json of ['null', 'true', '42', '"hello"', '[1,2]', '{}']) {
  assert.equal(format(json), JSON.stringify(JSON.parse(json), null, 2));
}
for (const text of ['', '  ordinary text\r\n', '{"broken":', '[base64]\nAP8R', '<html><script>alert(1)</script></html>', '<root><item>1</item></root>']) {
  assert.equal(format(text), text, 'Text and XML without browser DOM APIs are unchanged');
}
const large = ' '.repeat(2097153);
assert.equal(format(large), large);
const deep = '['.repeat(1000) + '0' + ']'.repeat(1000);
assert.equal(format(deep), deep, 'Deep data stays raw instead of creating excessive indentation');

// Keep the shared response filter identical to the replay implementation.
vm.runInContext(await readFile(new URL('../replay.js', import.meta.url), 'utf8'), context);
for (const type of ['', 'text/plain', 'text/html', 'TEXT/HTML; charset=utf-8', 'application/xhtml+xml', 'application/custom+html', 'application/xml', 'text/xml', 'image/svg+xml', 'application/json']) {
  for (const text of ['', '<div>hello</div>', '<root/>', '<code>42</code>', '<html/>', '<!doctype html><html/>', '<!-- unfinished', '<?xml unfinished', ' '.repeat(10000) + '<?xml version="1.0"?><!-- demo --><html/>', '{"html":"<div>data</div>"}']) {
    assert.equal(isHTML(type, text), context.CTFReplay.isHTML(type, text), `${type}: ${text.slice(0, 80)}`);
  }
}
console.log('Body format tests passed (XML formatting requires browser DOM APIs).');
