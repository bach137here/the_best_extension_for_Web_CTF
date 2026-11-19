import { readFile, writeFile, unlink } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
const context = vm.createContext({ URL, TextEncoder, TextDecoder, Uint8Array, btoa, atob });
vm.runInContext(await readFile(new URL('../network.js', import.meta.url), 'utf8'), context);
const api = context.CTFNetwork;
assert.equal(typeof api.curlCmd, 'function', 'Windows CMD exporter must exist');
const captured = [];
let resolveAll;
const allCaptured = new Promise(resolve => { resolveAll = resolve; });
const server = createServer((req, res) => {
  const parts = [];
  req.on('data', part => parts.push(part));
  req.on('end', () => { captured.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(parts) }); res.end('ok'); if (captured.length === 3) resolveAll(); });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const external = process.argv.includes('--external');
const commandFile = new URL('./cmd-fixture-commands.txt', import.meta.url);
async function run(command) {
  const child = spawn('cmd.exe', ['/d', '/q', '/v:off'], { windowsHide: true, env: { ...process.env, CTF_CMD_PROBE: 'MUST_NOT_EXPAND' } });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(output))); });
  child.stdin.end('@echo off\r\n' + command.replace('curl.exe', 'curl.exe --max-time 5') + '\r\nexit\r\n');
  await done;
  return output;
}
try {
  const payload = JSON.stringify({ text: 'quote" slash\\ ^ & | < > %CTF_CMD_PROBE% !hello!', file: '@local-file' });
  const request = { method: 'POST', url: `http://127.0.0.1:${port}/admin?q=%252F&literal=%CTF_CMD_PROBE%`, headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'X-Check', value: 'quote" slash\\ ^ & | < > %CTF_CMD_PROBE% !hello!' }], body: { text: payload } };
  const command = api.curlCmd(request);
  assert.ok(command.startsWith('curl.exe ')); assert.ok(command.includes(' ^\r\n'));
  const unicode = 'Tiếng Việt 🔐\r\nsecond line\tvalue';
  const bytes = Buffer.from([0, 255, 17, 13, 10]);
  const unicodeCommand = api.curlCmd({ ...request, url: `http://127.0.0.1:${port}/unicode`, body: { text: unicode } });
  const binaryCommand = api.curlCmd({ ...request, url: `http://127.0.0.1:${port}/binary`, body: { base64: bytes.toString('base64') } });
  if (external) {
    await writeFile(commandFile, '@echo off\r\nset CTF_CMD_PROBE=MUST_NOT_EXPAND\r\n' + [command, unicodeCommand, binaryCommand].map(value => value.replace('curl.exe', 'curl.exe --max-time 5')).join('\r\n') + '\r\nexit\r\n');
    console.log(`READY: loopback ${port}; feed tests/cmd-fixture-commands.txt to cmd.exe /d /q /v:off`);
    let timeout;
    try { await Promise.race([allCaptured, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('CMD fixture timed out')), 45000); })]); }
    finally { clearTimeout(timeout); }
  } else { await run(command); }
  assert.equal(captured.length, external ? 3 : 1, 'CMD command must send exactly one request');
  assert.equal(captured[0].url, '/admin?q=%252F&literal=%CTF_CMD_PROBE%');
  assert.equal(captured[0].headers['x-check'], request.headers[1].value);
  assert.equal(captured[0].body.toString('utf8'), payload);
  if (!external) await run(unicodeCommand);
  assert.equal(captured[1].body.toString('utf8'), unicode, 'Unicode and multiline body must retain bytes');
  if (!external) await run(binaryCommand);
  assert.deepEqual(captured[2].body, bytes);
  assert.throws(() => api.curlCmd({ ...request, body: { missing: true } }), /body/i);
  assert.throws(() => api.curlCmd({ ...request, headers: [{ name: 'X-Test', value: 'bad\nheader' }] }), /header|control|ký tự/i);
  assert.throws(() => api.curlCmd({ ...request, body: { text: 'x'.repeat(10000) } }), /CMD|dài/i);
  console.log('PASS: real cmd.exe + curl.exe loopback requests preserve URL %, JSON quotes, metacharacters, Unicode/multiline and binary bodies.');
} finally { await new Promise(resolve => server.close(resolve)); if (external) await unlink(commandFile).catch(() => {}); }
