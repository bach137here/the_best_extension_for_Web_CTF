import vm from 'node:vm';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const listeners=[],messages=[],seen=[];
const window={origin:'https://ctf.test',addEventListener(type,listener){if(type==='message')listeners.push(listener);},postMessage(data,targetOrigin){assert.equal(targetOrigin,'https://ctf.test','Never broadcast response data across a navigation to another origin');messages.push(data);for(const listener of listeners)listener({source:window,origin:targetOrigin,data});}};
window.fetch=(input,init)=>{seen.push({locked:init?.body?.locked===true});const result=Promise.resolve(new Response('{"ok":true}',{headers:{'Content-Type':'application/json'}}));window.lastNative=result;return result;};
const context=vm.createContext({window,location:{href:'https://ctf.test/'},URL,Request,Response,TextEncoder,TextDecoder,ArrayBuffer,URLSearchParams,FormData,Blob,btoa,performance,ReadableStream,setTimeout,clearTimeout});
vm.runInContext(await readFile(new URL('../body-format.js',import.meta.url),'utf8'),context);
vm.runInContext(await readFile(new URL('../network-tap.js',import.meta.url),'utf8'),context);
for(const enabled of [false,true]){
  window.postMessage({channel:'ctf-simple.capture-control',enabled},window.origin);
  const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('payload'));controller.close();}});
  const response=window.fetch('https://ctf.test/upload',{method:'POST',body,duplex:'half'});
  assert.equal(response,window.lastNative,'Return the native Fetch promise unchanged');
  assert.equal(seen.at(-1).locked,false,'Never lock the caller-owned upload stream');
  await (await response).text();
}
await new Promise(resolve=>setTimeout(resolve,30));
assert.ok(messages.some(message=>message.channel==='ctf-simple.response'&&message.packet.body==='{"ok":true}'));
console.log('PASS: non-consuming stream inspection, native promise identity, body preview capture and fixed-origin message delivery.');
