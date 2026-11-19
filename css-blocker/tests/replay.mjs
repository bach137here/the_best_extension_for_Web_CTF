import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
const context=vm.createContext({URL,TextEncoder});
vm.runInContext(await readFile(new URL('../replay.js',import.meta.url),'utf8'),context);
const parse=context.CTFReplay.parse;
const raw='POST /login?q=%252F HTTP/1.1\r\nHost: example.test\r\nContent-Type: application/json\r\nCookie: session=demo\r\nAuthorization: Bearer demo\r\nX-CSRF-Token: token\r\nSec-Fetch-Site: same-origin\r\nContent-Length: 999\r\n\r\n{"name":"guest"}\r\n';
const request=parse(raw);assert.equal(request.url,'https://example.test/login?q=%252F');assert.equal(new TextDecoder().decode(request.body),'{"name":"guest"}\r\n');
assert.deepEqual(Array.from(request.headers,pair=>Array.from(pair)),[['Content-Type','application/json'],['Authorization','Bearer demo'],['X-CSRF-Token','token']]);
assert.ok(request.skipped.includes('Cookie'));assert.ok(request.skipped.includes('Host'));
assert.equal(parse('GET //other.test/admin HTTP/1.1\nHost: safe.test\n\n').url,'https://safe.test//other.test/admin','Double slash remains a path on the selected host');
assert.equal(parse('GET http://localhost:8080/path HTTP/1.1\n\n').url,'http://localhost:8080/path');
assert.equal(parse('GET / HTTP/1.1\nHost: [::1]:8000\n\n','http:').url,'http://[::1]:8000/');
assert.equal(parse('custom / HTTP/1.1\nHost: test.local\n\n').method,'custom','Keep case of nonstandard methods');
for(const text of ['GET / HTTP/1.1\n\n','GET / HTTP/1.1\nHost: a@b\n\n','GET / HTTP/1.1\nHost: a\nHost: b\n\n','TRACE / HTTP/1.1\nHost: a\n\n','GET / HTTP/1.1\nHost: a\n\nbody','GET / HTTP/1.1\nBad Header: x\nHost: a\n\n']) assert.throws(()=>parse(text));
const server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({method:req.method,url:req.url,headers:req.headers,body:Buffer.concat(chunks).toString('utf8')}));
});
assert.throws(()=>parse('POST / HTTP/1.1\nHost: ctf.test\nTransfer-Encoding: chunked\n\n3\r\nabc\r\n0\r\n\r\n'),/Transfer-Encoding/);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
  const port=server.address().port;
  const input=parse(`POST /echo?x=%252F HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Check: yes\r\nContent-Type: text/plain\r\nContent-Length: 1\r\n\r\nline 1\r\nline 2`,'http:');
  const response=await fetch(input.url,{method:input.method,headers:input.headers,body:input.body});const echo=await response.json();
  assert.equal(echo.method,'POST');assert.equal(echo.url,'/echo?x=%252F');assert.equal(echo.body,'line 1\r\nline 2');assert.equal(echo.headers['x-check'],'yes');assert.equal(Number(echo.headers['content-length']),14);
}finally{await new Promise(resolve=>server.close(resolve));}
console.log('PASS: Raw parser, browser-controlled headers, exact body/newlines, safe authority resolution, invalid requests, and real fetch loopback.');
