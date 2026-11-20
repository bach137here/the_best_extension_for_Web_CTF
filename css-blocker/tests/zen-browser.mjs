import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const task=await taskSpace('CTF simple verification'),page=(await task.pages())[0];
console.log({spaceId:task.spaceId});
await page.goto('data:text/html,'+encodeURIComponent(`<!doctype html><title>Zen DOM lifecycle regression</title>
<aside id="static">Unrelated navigation</aside><main id="app">Render 0<form><input id="input" value="keep me"><button id="update" type="button">Update page</button></form><output id="result">ready</output></main>`));
await page.evaluate(()=>{
 const listeners=[];
 const prefs={passwords:false,reveal:false,unlock:false,textInputs:false,copy:false,urlBar:false};
 globalThis.chrome={storage:{local:{get:async()=>({prefs}),set:async values=>{for(const fn of listeners)fn(Object.fromEntries(Object.entries(values).map(([key,newValue])=>[key,{newValue}])),'local');}},onChanged:{addListener:fn=>listeners.push(fn)}},runtime:{sendMessage:async()=>({})}};
 let render=0,text=document.querySelector('#app').firstChild;
 document.querySelector('#update').addEventListener('click',()=>{
  try{const parent=document.querySelector('#app');parent.removeChild(text);text=document.createTextNode('Render '+(++render));parent.insertBefore(text,parent.firstChild);document.querySelector('#result').textContent='render '+render;}
  catch(error){document.querySelector('#result').textContent=error.name+': '+error.message;}
 });
});
for(const file of ['dom-guard.js','content.js','page.js'])await page.evaluate(await readFile(new URL('../'+file,import.meta.url),'utf8'));
await page.evaluate(async()=>{await CTFPageReady;await CTFPage.ready;});
await page.click('#update');
assert.equal(await page.evaluate(()=>document.querySelector('#result').textContent),'render 1');
await page.evaluate(()=>CTFPage.setZen(true));
assert.equal(await page.evaluate(()=>getComputedStyle(document.querySelector('#static')).display),'none');
await page.click('#update');
assert.equal(await page.evaluate(()=>document.querySelector('#result').textContent),'render 2','Zen must not detach text nodes still owned by the app');
await page.click('loc=role:button[name="Tắt Zen"]');
await page.click('#update');
assert.equal(await page.evaluate(()=>document.querySelector('#result').textContent),'render 3');
assert.notEqual(await page.evaluate(()=>getComputedStyle(document.querySelector('#static')).display),'none');
assert.equal(await page.evaluate(()=>document.querySelector('#input').value),'keep me');
assert.equal(await page.evaluate(()=>[...document.querySelector('#app').childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join('')),'Render 3','Turning Zen off must not resurrect stale app text');
await page.evaluate(()=>CSSBlocker.enable());
for(let index=0;index<20;index++){
 await page.evaluate(()=>CTFPage.setZen(true));
 await page.click('loc=role:button[name="Tắt Zen"]');
}
await page.click('#update');
assert.equal(await page.evaluate(()=>document.querySelector('#result').textContent),'render 4');
assert.equal(await page.evaluate(()=>document.querySelectorAll('ctf-toolbar').length),0);
await page.evaluate(()=>{
 CTFPage.configure({unlock:true,textInputs:true});
 const form=document.createElement('form');form.id='lateForm';
 form.innerHTML='<input id="lateInput" type="email" required pattern="only-this" minlength="10" maxlength="12" min="5" max="8" step="2" readonly disabled accept="image/png"><button disabled>Submit</button>';
 document.body.append(form);
});
await page.waitForFunction(()=>document.querySelector('#lateForm').noValidate&&document.querySelector('#lateInput').type==='text'&&!document.querySelector('#lateInput').hasAttribute('required'));
assert.deepEqual(await page.evaluate(()=>['required','pattern','minlength','maxlength','min','max','step','readonly','disabled','accept'].filter(name=>document.querySelector('#lateInput').hasAttribute(name))),[],'Strip HTML form constraints from dynamically inserted fields');
assert.equal(await page.evaluate(()=>document.querySelector('#lateForm').checkValidity()),true);
assert.equal(await page.evaluate(()=>document.querySelector('#lateForm button').disabled),false);
console.log('PASS: live DOM updates while Zen is on/off, original node ownership, preserved input/listeners, no stale text, and repeated toggles with CSS blocked.');
