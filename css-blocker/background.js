importScripts('policy.js', 'i18n.js', 'body-format.js', 'network.js');
const filter = { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] };
const tabURLs = new Map();
const requestPages = new Map();
function pageAtEvent(details) {
  const key = JSON.stringify([details.tabId, details.requestId, details.url]);
  if (!requestPages.has(key)) {
    const page = details.tabId < 0 ? details.initiator : tabURLs.get(details.tabId) || chrome.tabs.get(details.tabId).then(tab => tab.url).catch(() => null);
    const payload = CTFNetwork.body(details.requestBody);
    const tag = !payload ? 'none' : payload.missing || payload.truncated ? null : payload.text !== undefined ? CTFBody.tag('text',payload.text) : payload.base64 !== undefined ? CTFBody.tag('base64',payload.base64) : null;
    requestPages.set(key, { tabId: details.tabId, page, policy: settingsLoaded ? { ...settings } : settingsReady.then(() => ({ ...settings })), request:{tabId:details.tabId,rid:details.requestId,url:details.url,method:details.method||'GET',type:details.type,frameId:details.frameId||0,time:details.timeStamp,tag} });
    if (requestPages.size > 3000) requestPages.delete(requestPages.keys().next().value);
  }
  return requestPages.get(key);
}
let settings = {};
let settingsLoaded = false;
const settingsReady = chrome.storage.local.get(['disabledSites', 'disabledEndpoints', 'language']).then(saved => {
  settings = saved; settingsLoaded = true; CTFI18N.setLanguage(settings.language || 'vi');
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const update = () => {
    for (const key of ['disabledSites', 'disabledEndpoints', 'language']) if (changes[key]) settings[key] = changes[key].newValue;
    CTFI18N.setLanguage(settings.language || 'vi');
  };
  if (settingsLoaded) update(); else settingsReady.then(update);
});
chrome.tabs.onUpdated.addListener((tabId, change) => { if (change.url) tabURLs.set(tabId, change.url); });
async function allowedContext(details, capturedPage) {
  await settingsReady;
  const originalPolicy = await capturedPage.policy;
  if (CTFPolicy.isDisabled(details.url, settings) || CTFPolicy.isDisabled(details.url, originalPolicy)) return null;
  const pageUrl = await capturedPage.page;
  if (!pageUrl) return null;
  if (details.tabId < 0) {
    // A worker has no reliable endpoint attribution: do not log it when an endpoint on its host is paused.
    const host = new URL(pageUrl).hostname;
    if ([settings, originalPolicy].some(policy => Array.isArray(policy.disabledEndpoints) && policy.disabledEndpoints.some(key => key.startsWith(host + '/')))) return null;
  }
  return !CTFPolicy.isDisabled(pageUrl, settings) && !CTFPolicy.isDisabled(pageUrl, originalPolicy) ? pageUrl : null;
}
let queue = Promise.resolve();
let captureWarning = '';
const pendingResponses = [];
async function attachResponse(entries, item) {
  const {packet,tabId,frameId}=item;
  let candidates=[...requestPages.values()].filter(context=>{const req=context.request;return req.tabId===tabId&&req.frameId===frameId&&req.url===packet.url&&req.method===packet.method&&req.type==='xmlhttprequest'&&Number.isFinite(req.time)&&Math.abs(req.time-packet.started)<1000;});
  if(packet.tags)candidates=candidates.filter(context=>context.request.tag&&packet.tags.includes(context.request.tag));
  candidates.sort((a,b)=>Math.abs(a.request.time-packet.started)-Math.abs(b.request.time-packet.started));
  if(!candidates.length)return false;
  if((!packet.tags&&candidates.length>1)||(candidates[1]&&Math.abs(Math.abs(candidates[0].request.time-packet.started)-Math.abs(candidates[1].request.time-packet.started))<2))return true;
  const context=candidates[0];
  if(context.responseSeen)return true;
  const finalContext=requestPages.get(JSON.stringify([tabId,context.request.rid,packet.finalUrl]));
  if(packet.finalUrl!==packet.url&&!finalContext)return false;
  if(!await allowedContext(context.request,context)||CTFPolicy.isDisabled(packet.finalUrl,settings)||CTFPolicy.isDisabled(packet.finalUrl,await context.policy)||(finalContext&&!await allowedContext(finalContext.request,finalContext)))return true;
  const entry=entries.find(entry=>entry.tabId===tabId&&entry.rid===context.request.rid&&entry.url===packet.finalUrl);
  if(!entry)return true;
  const html=packet.html||CTFBody.isHTML(packet.contentType,packet.body);
  entry.response={body:html?'':packet.body,html,contentType:packet.contentType,truncated:packet.truncated,status:packet.status};
  context.responseSeen=true;
  if(finalContext)finalContext.responseSeen=true;
  return true;
}
async function attachPending(entries){
  for(let index=pendingResponses.length-1;index>=0;index--){const item=pendingResponses[index];if(Date.now()-item.received>10000||await attachResponse(entries,item))pendingResponses.splice(index,1);}
  return entries;
}
function serialized(task) {
  const result = queue.then(task);
  queue = result.catch(error => { captureWarning = error.message; console.warn('CTF requests:', error.message); });
  return result;
}
async function read() { return ((await chrome.storage.session.get('requests')).requests || []).filter(entry => !CTFNetwork.isStatic(entry)); }
function visible(details) {
  return !CTFNetwork.isStatic(details) && (details.tabId >= 0 || /^https?:\/\//.test(details.initiator || ''));
}
function snapshot(details) {
  return { tabId: details.tabId, rid: details.requestId, method: details.method || 'GET', url: details.url,
    type: details.type || 'other', frameId: details.frameId, initiator: details.initiator,
    headers: [], headersKnown: false, time: details.timeStamp };
}
chrome.webRequest.onBeforeRequest.addListener(details => {
  if (details.type === 'main_frame' && details.tabId >= 0) tabURLs.set(details.tabId, details.url);
  if (!visible(details)) return;
  const capturedPage = pageAtEvent(details);
  serialized(async () => {
    const pageUrl = await allowedContext(details, capturedPage); if (!pageUrl) return;
    const request = { ...snapshot(details), pageUrl, body: CTFNetwork.body(details.requestBody) };
    const entries=CTFNetwork.upsert(await read(), request);await attachPending(entries);
    await chrome.storage.session.set({ requests: CTFNetwork.trim(entries) });
  });
}, filter, ['requestBody', 'extraHeaders']);
chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  if (!visible(details)) return;
  const capturedPage = pageAtEvent(details);
  serialized(async () => {
    const pageUrl = await allowedContext(details, capturedPage); if (!pageUrl) return;
    const entries = await read();
    let entry = entries.find(entry => entry.tabId === details.tabId && entry.rid === details.requestId && entry.url === details.url);
    if (!entry) {
      if (entries.some(entry => entry.tabId === details.tabId && entry.url === details.url && entry.method === details.method)) return;
      entry = { ...snapshot(details), pageUrl };
      if (!['GET', 'HEAD', 'OPTIONS'].includes(entry.method)) entry.body = { missing: true };
      CTFNetwork.upsert(entries, entry);
      entry = entries[entries.length - 1];
    }
    entry.headers = details.requestHeaders || []; entry.headersKnown = true;
    await attachPending(entries);
    await chrome.storage.session.set({ requests: CTFNetwork.trim(entries) });
  });
}, filter, ['requestHeaders', 'extraHeaders']);
function finish(details) {
  if (!visible(details)) return;
  const capturedPage = pageAtEvent(details);
  serialized(async () => {
    const pageUrl = await allowedContext(details, capturedPage); if (!pageUrl) return;
    const entries = await read();
    let entry = entries.find(entry => entry.tabId === details.tabId && entry.rid === details.requestId && entry.url === details.url);
    if (!entry) {
      // An earlier duplicate may finish after a newer one: keep the newer group's status.
      if (entries.some(entry => entry.tabId === details.tabId && entry.url === details.url && entry.method === details.method)) return;
      const fallback = { ...snapshot(details), pageUrl };
      if (!['GET', 'HEAD', 'OPTIONS'].includes(fallback.method)) fallback.body = { missing: true };
      CTFNetwork.upsert(entries, fallback); entry = entries[entries.length - 1];
    }
    entry.status = details.error || details.statusCode;
    entry.fromCache = !!details.fromCache;
    const contentType = details.responseHeaders?.find(header => header.name.toLowerCase() === 'content-type')?.value;
    if (contentType) entry.contentType = contentType.split(';')[0].trim().toLowerCase();
    if (Number.isFinite(details.timeStamp - entry.time)) entry.duration = Math.max(0, details.timeStamp - entry.time);
    await chrome.storage.session.set({ requests: entries });
  });
}
chrome.webRequest.onResponseStarted.addListener(finish, filter, ['responseHeaders', 'extraHeaders']);
chrome.webRequest.onCompleted.addListener(finish, filter);
chrome.webRequest.onBeforeRedirect.addListener(finish, filter);
chrome.webRequest.onErrorOccurred.addListener(finish, filter);
chrome.tabs.onRemoved.addListener(tabId => serialized(async () => {
  tabURLs.delete(tabId);
  for (const [key, context] of requestPages) if (context.tabId === tabId) requestPages.delete(key);
  await chrome.storage.session.set({ requests: (await read()).filter(entry => entry.tabId !== tabId) });
  await chrome.storage.session.remove(`address:${tabId}`);
}));
chrome.runtime.onInstalled.addListener(() => {
  // Migration: remove only this extension's old JS rules; there is no JS blocker in v3.
  chrome.contentSettings.javascript.clear({ scope: 'regular' }).catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if(message?.type==='responseBody'){
    const packet=message.packet,tabId=sender.tab?.id,frameId=sender.frameId||0;
    if(!Number.isInteger(tabId)||tabId<0||(!/^https?:\/\//.test(sender.url||'')&&!/^https?:\/\//.test(sender.origin||''))||!packet||typeof packet.body!=='string'||packet.body.length>100000||typeof packet.contentType!=='string'||packet.contentType.length>256||typeof packet.method!=='string'||packet.method.length>32||!Number.isFinite(packet.started)||typeof packet.html!=='boolean'||typeof packet.truncated!=='boolean'||!Number.isInteger(packet.status)||(packet.tags!==null&&(!Array.isArray(packet.tags)||packet.tags.length>3||packet.tags.some(tag=>typeof tag!=='string'||tag.length>128))))return;
    try{for(const value of [packet.url,packet.finalUrl]){if(typeof value!=='string'||value.length>16384||!['http:','https:'].includes(new URL(value).protocol))return;}}catch{return;}
    serialized(async()=>{
      const html=packet.html||CTFBody.isHTML(packet.contentType,packet.body);
      const entries=await read(),item={packet:{...packet,html,body:html?'':packet.body},tabId,frameId,received:Date.now()};
      if(!await attachResponse(entries,item)){pendingResponses.push(item);if(pendingResponses.length>32)pendingResponses.shift();}
      await chrome.storage.session.set({requests:CTFNetwork.trim(entries)});
    }).then(()=>sendResponse({ok:true}),error=>sendResponse({error:error.message}));
    return true;
  }
  if (message?.type === 'takeReplay') {
    if (sender.url?.split('#')[0] !== chrome.runtime.getURL('response.html') || !/^replay:[a-zA-Z0-9-]+$/.test(message.key || '')) return;
    serialized(async () => {
      const stored = await chrome.storage.session.get(message.key), job = stored[message.key];
      await chrome.storage.session.remove(message.key);
      return job;
    }).then(job => sendResponse({ job }), error => sendResponse({ error: error.message }));
    return true;
  }
  if (message?.type === 'scopeContext' && sender.tab?.id >= 0) {
    Promise.resolve(sender.tab.url ? sender.tab : chrome.tabs.get(sender.tab.id)).then(tab => sendResponse({ url: tab.url }), () => sendResponse({ url: '' }));
    return true;
  }
  if (['navigate', 'address'].includes(message?.type) && sender.tab?.id >= 0) {
    try {
      const url = new URL(message.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Chỉ chấp nhận URL HTTP/HTTPS.');
      (async () => {
        const key = `address:${sender.tab.id}`;
        const addresses = (await chrome.storage.session.get(key))[key] || [];
        if (message.type === 'address') return { raw: addresses.find(entry => entry.target === url.href)?.raw ?? message.url };
        const history = [{ target: url.href, raw: message.url }, ...addresses.filter(entry => entry.target !== url.href)].slice(0, 20);
        while (history.length > 1 && JSON.stringify(history).length > 300000) history.pop();
        await chrome.storage.session.set({ [key]: history });
        await chrome.tabs.update(sender.tab.id, { url: message.url });
        return { ok: true };
      })().then(sendResponse, error => sendResponse({ error: error.message }));
    } catch (error) { sendResponse({ error: error.message }); }
    return true;
  }
  // Request logs, including auth headers, are available only to extension UI.
  if (sender.tab || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  if (!['requests', 'clearRequests'].includes(message?.type) || !Number.isInteger(message.tabId)) return;
  serialized(async () => {
    await settingsReady;
    let entries = await read();
    const page = new URL(message.pageUrl);
    if (CTFPolicy.isDisabled(page.href, settings)) return [];
    const inScope = entry => {
      try {
        return !CTFPolicy.isDisabled(entry.url, settings) && !CTFPolicy.isDisabled(entry.pageUrl, settings) && new URL(entry.url).hostname === page.hostname && (entry.tabId === message.tabId || (entry.tabId === -1 && entry.initiator === page.origin));
      } catch { return false; }
    };
    if (message.type === 'clearRequests') {
      entries = entries.filter(entry => !inScope(entry));
      await chrome.storage.session.set({ requests: entries });
      captureWarning = '';
    }
    return entries.filter(inScope).reverse();
  }).then(entries => sendResponse({ entries, warning: captureWarning }), error => sendResponse({ error: error.message }));
  return true;
});
