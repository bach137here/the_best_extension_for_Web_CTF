import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const {origin}=JSON.parse(await readFile(new URL('./demo-context.json',import.meta.url)));
const task=await taskSpace('CTF simple verification');const page=task.page('p1');
console.log({spaceId:task.spaceId});
await page.goto(origin+'/popup?lang=en');await page.waitForFunction(()=>!document.querySelector('#block').disabled);
await page.evaluate(async()=>{
  const original=chrome.runtime.sendMessage, initial=(await original({type:'requests'})).entries;
  window.__entries=[...initial,
    {method:'POST',url:'https://demo.ctf/api/login?q=guest',tabId:7,type:'xmlhttprequest',contentType:'application/json',status:401,count:1,time:90,body:{text:'{"username":"guest"}'}},
    {method:'POST',url:'https://demo.ctf/api/login?q=admin',tabId:7,type:'xmlhttprequest',contentType:'application/json',status:200,count:1,time:100,body:{text:'{"username":"admin"}'}}
  ].map(entry=>({...entry,headers:[{name:'Content-Type',value:'application/json'},{name:'Authorization',value:'Bearer demo'},{name:'User-Agent',value:'demo-browser'},{name:'Sec-Fetch-Site',value:'same-origin'}]}));
  chrome.runtime.sendMessage=async message=>message.type==='requests'?{entries:window.__entries}:original(message);
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});
  await loadRequests(true);
});
assert.equal(await page.evaluate(()=>document.querySelector('#requestCount').textContent),'4');
await page.click('.request:first-child [data-format=curl]');
assert.ok(await page.evaluate(()=>window.__copied.includes('admin')&&!window.__copied.includes('User-Agent')));
await page.selectOption('#exportHeaders','full');await page.click('.request:first-child [data-format=raw]');
assert.ok(await page.evaluate(()=>window.__copied.includes('User-Agent')&&window.__copied.endsWith('{"username":"admin"}')));
await page.click('.request:first-child .expand-url');
await page.selectOption('.request:first-child .url-detail select','1');await page.click('.request:first-child [data-format=raw]');
assert.ok(await page.evaluate(()=>window.__copied.endsWith('{"username":"guest"}')&&window.__copied.includes('q=guest')));
await page.click('#refresh');await page.click('.request:first-child [data-format=raw]');
assert.ok(await page.evaluate(()=>window.__copied.endsWith('{"username":"guest"}')));
await page.click('#groupEndpoints');assert.equal(await page.evaluate(()=>document.querySelector('#requestCount').textContent),'6');
await page.reload();await page.waitForFunction(()=>!document.querySelector('#block').disabled);
assert.equal(await page.evaluate(()=>document.querySelector('#exportHeaders').value),'full');assert.equal(await page.evaluate(()=>document.querySelector('#groupEndpoints').checked),false);
await page.click('#groupEndpoints');await page.selectOption('#exportHeaders','minimal');
const layout=await page.evaluate(()=>({body:document.body.scrollHeight,headingOverflow:document.querySelector('.network-panel>.heading').scrollWidth>document.querySelector('.network-panel>.heading').clientWidth}));
assert.equal(layout.body,590);assert.equal(layout.headingOverflow,false);
async function print(target,name,width=780,height=590){const result=await target.cdp('Page.printToPDF',{printBackground:true,paperWidth:width/96,paperHeight:height/96,marginTop:0,marginBottom:0,marginLeft:0,marginRight:0});await writeFile(new URL('../docs/screenshots/'+name+'.pdf',root),Buffer.from(result.data,'base64'));}
await print(page,'popup-en');
await page.click('#language');await page.waitForFunction(()=>document.querySelector('#block').textContent.includes('Chặn'));
assert.equal(await page.evaluate(()=>document.querySelector('.network-panel>.heading').scrollWidth>document.querySelector('.network-panel>.heading').clientWidth),false);
await print(page,'popup-vi');await page.click('#language');
const before=(await task.pages()).length;
await page.click('#rawFetch');assert.equal((await task.pages()).length,before,'Raw editor must open in the popup, not another tab');
assert.equal(await page.evaluate(()=>document.querySelector('#rawRequest').value),'');
await page.fill('#rawRequest','broken');await page.click('#send');assert.equal((await task.pages()).length,before);assert.ok(await page.evaluate(()=>document.querySelector('#rawError').textContent.length>0));
const host=new URL(origin).host;
await page.fill('#rawRequest',`POST /__echo?status=403 HTTP/1.1\r\nHost: ${host}\r\nContent-Type: text/plain\r\nX-Check: demo\r\nCookie: manual-cookie\r\n\r\nline 1\r\nline 2`);
await page.selectOption('#protocol','http:');await print(page,'raw-editor');
await page.click('#send');
await page.waitForFunction(()=>/^403/.test(document.querySelector('#rawSummary')?.textContent||'')&&!document.querySelector('#rawResult').hidden);
assert.equal((await task.pages()).length,before,'Sending must show the response inline without a new tab');
const echo=JSON.parse(await page.evaluate(()=>document.querySelector('#rawBody').textContent));
assert.equal(echo.body,'line 1\nline 2','Browser textarea normalizes CRLF to LF, as documented');assert.equal(echo.check,'demo');assert.equal(echo.method,'POST');
assert.ok(await page.evaluate(()=>document.querySelector('#rawNotice').textContent.includes('Cookie')));
await print(page,'fetch-response');
await page.fill('#rawRequest',`GET /__html HTTP/1.1\nHost: ${host}\n\n`);
await page.click('#send');await page.waitForFunction(()=>document.querySelector('#rawNotice')?.textContent.includes('HTML response skipped'));
assert.ok(await page.evaluate(()=>document.querySelector('#rawBody').hidden&&document.querySelector('#rawBody').textContent===''&&!window.__ctfExecuted));
assert.equal((await task.pages()).length,before);
console.log('PASS: grouping, selected-variant copy, saved export options, bilingual layout, inline Fetch response without opening tabs, HTTP errors and blocked HTML.');
