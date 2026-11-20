import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const task=await taskSpace('CTF simple verification'),page=(await task.pages())[0];
await page.goto('data:text/html,'+encodeURIComponent('<!doctype html><p>Detached toolbar regression</p><div id="host"></div>'));
await page.evaluate(()=>{
 window.chrome={storage:{local:{get:async()=>({})}}};
 window.__host=document.querySelector('#host');
 __host.attachShadow({mode:'open'}).innerHTML='<style>button{color:red}</style><button>Disable Zen</button>';
 // Bound a faulty observer so this regression reports a failure instead of hanging Chromium.
 const NativeObserver=MutationObserver;window.__callbacks=0;window.__loop=false;
 window.MutationObserver=class extends NativeObserver{constructor(callback){super((records,observer)=>{if(++__callbacks>50){__loop=true;observer.disconnect();return;}callback(records,observer);});}};
});
await page.evaluate(await readFile(new URL('../content.js',import.meta.url),'utf8'));
await page.evaluate(()=>CSSBlocker.enable());
await page.waitForFunction(()=>__host.shadowRoot.querySelector('style')?.textContent.includes('max-width'));
await page.evaluate(()=>{__callbacks=0;__host.remove();window.__settled=false;setTimeout(()=>__settled=true,50);});
await page.waitForFunction(()=>__settled);
const result=await page.evaluate(()=>({loop:__loop,callbacks:__callbacks,styles:__host.shadowRoot.querySelectorAll('style').length}));
assert.equal(result.loop,false,'Removing a shadow host must not cause endless safety stylesheet insertion: '+JSON.stringify(result));
assert.equal(result.styles,1,'Do not accumulate styles in a detached toolbar');
console.log('PASS: detached shadow roots do not trigger observer loops or unbounded stylesheet growth.');
