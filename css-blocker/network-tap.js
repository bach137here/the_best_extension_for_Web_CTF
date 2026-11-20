(() => {
  const marker=Symbol.for('ctf-simple.response-tap'); if(globalThis[marker])return; globalThis[marker]=true;
  const bodyTools=globalThis.CTFBody, max=65536;
  delete globalThis.CTFBody; // Keep the shared helper out of the application's globals.
  const pageOrigin=window.origin||new URL(location.href).origin;
  if(!/^https?:\/\//.test(pageOrigin))return;
  let enabled=false;
  window.addEventListener('message',event=>{if(event.source===window&&event.origin===pageOrigin&&event.data?.channel==='ctf-simple.capture-control')enabled=event.data.enabled===true;});
  const started=()=>performance.timeOrigin+performance.now();
  const requestURL=value=>{const url=new URL(String(value),location.href);url.hash='';return url.href;};
  const requestMethod=value=>{value=String(value||'GET');const upper=value.toUpperCase();return ['DELETE','GET','HEAD','OPTIONS','POST','PUT'].includes(upper)?upper:value;};
  const binary=bytes=>btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(''));
  function byteTags(bytes){
    if(bytes.length>max)return null;
    if(!bytes.length)return ['none',bodyTools.tag('text','')];
    try{if(bytes.includes(0))throw new Error('binary');return [bodyTools.tag('text',new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes))];}
    catch{return [bodyTools.tag('base64',binary(bytes))];}
  }
  function formText(pairs){const keys=new Map();for(const [key,value]of pairs){if(typeof value!=='string')return null;if(!keys.has(key))keys.set(key,[]);keys.get(key).push(value);}return [...keys].flatMap(([key,values])=>values.map(value=>encodeURIComponent(key)+'='+encodeURIComponent(value))).join('&');}
  async function read(stream){
    const chunks=[];let length=0,truncated=false;
    if(stream){const reader=stream.getReader(),timer=setTimeout(()=>{truncated=true;reader.cancel().catch(()=>{});},15000);try{while(true){const {done,value}=await reader.read();if(done)break;const take=value.subarray(0,max-length);chunks.push(take);length+=take.length;if(take.length<value.length||!enabled){truncated=true;reader.cancel().catch(()=>{});break;}}}finally{clearTimeout(timer);}}
    const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return {bytes,truncated};
  }
  async function requestTags(body, ownedStream=false){
    try{
      if(body==null)return ['none',bodyTools.tag('text','')];
      if(typeof body==='string')return byteTags(new TextEncoder().encode(body));
      if(body instanceof URLSearchParams){const text=body.toString(),form=formText(body);if(text.length>max||form.length>max)return null;return text?[bodyTools.tag('text',text),bodyTools.tag('text',form)]:['none',bodyTools.tag('text','')];}
      if(body instanceof FormData){const text=formText(body);return text===null||text.length>max?null:[bodyTools.tag('text',text)];}
      if(body instanceof Blob)return body.size>max?null:byteTags(new Uint8Array(await body.arrayBuffer()));
      if(body instanceof ArrayBuffer)return byteTags(new Uint8Array(body));
      if(ArrayBuffer.isView(body))return byteTags(new Uint8Array(body.buffer,body.byteOffset,body.byteLength));
      if(body?.getReader&&ownedStream){const data=await read(body);return data.truncated?null:byteTags(data.bytes);}
    }catch{}
    return null;
  }
  function emit(meta,response,preview,truncated=false){
    if(!enabled)return;
    Promise.resolve(meta.tags).then(tags=>{
      if(!enabled)return;
      window.postMessage({channel:'ctf-simple.response',packet:{url:meta.url,method:meta.method,started:meta.started,tags,finalUrl:response.url||meta.url,status:response.status,contentType:(response.contentType||'').slice(0,256),body:preview.body,html:preview.html,truncated}},pageOrigin);
    }).catch(()=>{});
  }
  const nativeFetch=window.fetch;
  if(nativeFetch)window.fetch=function(input,init){
    let meta;
    try{const request=input instanceof Request?input:null;let body=init?.body,ownedStream=false;const hasBody=body!=null||!!request?.body;if(enabled&&body==null&&request?.body){body=request.clone().body;ownedStream=true;}meta={url:requestURL(request?request.url:input),method:requestMethod(init?.method||request?.method),started:started(),tags:enabled?requestTags(body,ownedStream):Promise.resolve(hasBody?null:['none',bodyTools.tag('text','')])};}catch{}
    const promise=Reflect.apply(nativeFetch,this,arguments);
    if(meta)promise.then(async response=>{
      if(!enabled||!/^https?:/.test(meta.url)||response.type==='opaque')return;
      const contentType=response.headers.get('content-type')||'', info={url:response.url,status:response.status,contentType};
      if(bodyTools.isHTML(contentType)){emit(meta,info,{html:true,body:''});return;}
      try{const data=await read(response.clone().body);emit(meta,info,bodyTools.preview(data.bytes,contentType),data.truncated);}catch{}
    },()=>{}).catch(()=>{});
    return promise;
  };
  const prototype=window.XMLHttpRequest?.prototype;
  if(prototype){
    const open=prototype.open,send=prototype.send,metaByXHR=new WeakMap();
    prototype.open=function(method,url){try{metaByXHR.set(this,{method:requestMethod(method),url:requestURL(url)});}catch{metaByXHR.delete(this);}return Reflect.apply(open,this,arguments);};
    prototype.send=function(body){
      const opened=metaByXHR.get(this),xhr=this;
      if(opened){const meta={...opened,started:started(),tags:requestTags(body)};
        const done=async()=>{
          if(!enabled||!xhr.status||!/^https?:/.test(meta.url))return;
          try{
            const contentType=xhr.getResponseHeader('content-type')||'',info={url:xhr.responseURL||meta.url,status:xhr.status,contentType};
            if(bodyTools.isHTML(contentType)){emit(meta,info,{html:true,body:''});return;}
            let bytes,truncated=false,decodeType=contentType;
            if(xhr.responseType==='arraybuffer'){const all=new Uint8Array(xhr.response||new ArrayBuffer(0));truncated=all.length>max;bytes=all.subarray(0,max);}
            else if(xhr.responseType==='blob'){truncated=xhr.response.size>max;bytes=new Uint8Array(await xhr.response.slice(0,max).arrayBuffer());}
            else {const text=xhr.responseType==='json'?JSON.stringify(xhr.response):xhr.responseType==='document'?new XMLSerializer().serializeToString(xhr.responseXML):xhr.responseText;const all=new TextEncoder().encode(String(text).slice(0,max+1));truncated=text.length>max||all.length>max;bytes=all.subarray(0,max);decodeType=contentType.split(';')[0]+';charset=utf-8';}
            emit(meta,info,bodyTools.preview(bytes,decodeType),truncated);
          }catch{}
        };
        this.addEventListener('loadend',done,{once:true});
        try{return Reflect.apply(send,this,arguments);}catch(error){this.removeEventListener('loadend',done);throw error;}
      }
      return Reflect.apply(send,this,arguments);
    };
  }
  window.postMessage({channel:'ctf-simple.capture-ready'},pageOrigin);
})();
