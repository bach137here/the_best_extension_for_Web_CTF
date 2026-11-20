(() => {
  if(globalThis.CTFResponseBridge)return;globalThis.CTFResponseBridge=true;
  const pageOrigin=window.origin||new URL(location.href).origin;
  if(!/^https?:\/\//.test(pageOrigin))return;
  let inFlight=0;
  function configure(){window.postMessage({channel:'ctf-simple.capture-control',enabled:globalThis.CTFScope?.disabled===false},pageOrigin);}
  window.addEventListener('message',event=>{
    if(event.source===window&&event.origin===pageOrigin&&event.data?.channel==='ctf-simple.capture-ready'){configure();return;}
    const packet=event.data?.packet;
    if(event.source!==window||event.origin!==pageOrigin||event.data?.channel!=='ctf-simple.response'||globalThis.CTFScope?.disabled!==false||inFlight>=16||!packet||typeof packet.body!=='string'||packet.body.length>100000)return;
    inFlight++;
    chrome.runtime.sendMessage({type:'responseBody',packet}).catch(()=>{}).finally(()=>{inFlight--;});
  });
  Promise.resolve(globalThis.CTFScope?.ready).then(()=>{configure();chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&(changes.disabledSites||changes.disabledEndpoints))configure();});});
})();
