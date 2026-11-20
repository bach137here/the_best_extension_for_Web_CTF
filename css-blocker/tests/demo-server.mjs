// Local, synthetic demo UI for screenshots and browser regression tests. No real traffic or credentials.
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const files = new Set(['popup.css', 'popup.js', 'policy.js', 'i18n.js', 'scope.js', 'network.js', 'dom-guard.js', 'page.js', 'content.js', 'hints.js', 'replay.js', 'request.js', 'response.js', 'response.css', 'body-format.js','network-tap.js','response-bridge.js']);
function mockChrome(language, pageDemo = false) {
  return `(() => {
    const defaults = { language: ${JSON.stringify(language)}, disabledSites: [], disabledEndpoints: [], prefs: { passwords: true, reveal: true, unlock: true, textInputs: true, copy: true, urlBar: ${pageDemo} } };
    const read = () => ({ ...defaults, ...JSON.parse(localStorage.getItem('ctf-demo-settings') || '{}') });
    const listeners = [];
    const emit = (old, next) => { const changes = {}; for (const key of Object.keys(next)) if (JSON.stringify(old[key]) !== JSON.stringify(next[key])) changes[key] = { oldValue: old[key], newValue: next[key] }; for (const fn of listeners) fn(changes, 'local'); };
    window.addEventListener('storage', event => { if (event.key === 'ctf-demo-settings') emit(JSON.parse(event.oldValue || '{}'), JSON.parse(event.newValue || '{}')); });
    const hints = { names: ['.view-source', '.flag', '.secret-panel', '#admin', '.debug-info'].map(name => ({ name, important: true, used: false })), unreadable: 0 };
    const entries = [
      { method: 'GET', path: '/admin', status: 403, type: 'main_frame', contentType: 'text/html', count: 1, duration: 24 },
      { method: 'POST', path: '/api/login', status: 200, type: 'xmlhttprequest', contentType: 'application/json', count: 3, duration: 43, body: { text: '{"username":"demo"}' } },
      { method: 'GET', path: '/api/profile', status: 200, type: 'xmlhttprequest', contentType: 'application/json', count: 2, duration: 18 },
      { method: 'GET', path: '/flag', status: 404, type: 'xmlhttprequest', contentType: 'text/plain', count: 1, duration: 9 },
      { method: 'GET', path: '/assets/app.js', status: 304, type: 'script', contentType: 'application/javascript', count: 1, duration: 5, fromCache: true }
    ].map((entry, index) => ({ ...entry, tabId: 7, url: 'https://demo.ctf' + entry.path, headersKnown: true, headers: [{ name: 'Accept', value: 'application/json' }], time: index,
      ...(entry.path === '/api/login' ? {response:{contentType:'application/json',body:JSON.stringify({authenticated:true,role:'guest'})}} : entry.path === '/api/profile' ? {response:{contentType:'application/json',body:JSON.stringify({username:'demo',role:'guest'})}} : {}) }));
    window.chrome = {
      storage: { session: {
        get: async key => ({ [key]: JSON.parse(localStorage.getItem('ctf-demo-session') || '{}')[key] }),
        set: async values => localStorage.setItem('ctf-demo-session', JSON.stringify({ ...JSON.parse(localStorage.getItem('ctf-demo-session') || '{}'), ...values })),
        remove: async key => { const data = JSON.parse(localStorage.getItem('ctf-demo-session') || '{}'); delete data[key]; localStorage.setItem('ctf-demo-session', JSON.stringify(data)); }
      }, local: {
        get: async keys => { const data = read(); return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, data[key]])); },
        set: async values => { const old = read(), next = { ...old, ...values }; localStorage.setItem('ctf-demo-settings', JSON.stringify(next)); emit(old, next); },
        remove: async key => { const old = read(), next = { ...old }; delete next[key]; localStorage.setItem('ctf-demo-settings', JSON.stringify(next)); emit(old, next); }
      }, onChanged: { addListener: fn => listeners.push(fn) } },
      tabs: { query: async () => [{ id: 7, url: 'https://demo.ctf/challenge' }], reload: async () => {}, create: async options => { window.open(options.url, '_blank'); return { id: 100 }; } },
      runtime: { getURL: path => location.origin + '/' + path, sendMessage: async message => {
        if (message.type === 'takeReplay') { const jobs = JSON.parse(localStorage.getItem('ctf-demo-session') || '{}'), job = jobs[message.key]; delete jobs[message.key]; localStorage.setItem('ctf-demo-session',JSON.stringify(jobs)); return { job }; }
        if (message.type === 'address') return { raw: message.url };
        if (message.type === 'scopeContext') return { url: location.href };
        if (message.type === 'navigate') { location.assign(message.url); return { ok: true }; }
        if (message.type === 'clearRequests') entries.length = 0;
        return { entries: [...entries] };
      } },
      scripting: { executeScript: async options => {
        if (options.files) return [];
        return [{ frameId: 0, result: await options.func(...(options.args || [])) }];
      } }
    };
    ${pageDemo ? '' : `window.CTFScope = { ready: Promise.resolve() }; window.CSSBlocker = { active: false, enable() { this.active = true; } }; window.CTFHints = { list: () => hints }; window.CTFPage = { ready: Promise.resolve(), state: () => ({ prefs: read().prefs, hints, zen: false, css: CSSBlocker.active }) };`}
  })();`;
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/__stop') { res.end('stopped'); server.close(); return; }
    if (url.pathname === '/capture-demo') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><meta charset="utf-8"><title>Response capture fixture</title><script>${mockChrome('en')}window.CTFScope={disabled:false,ready:Promise.resolve()};window.__packets=[];chrome.runtime.sendMessage=async message=>{if(message.type==='responseBody')window.__packets.push(message.packet);return {ok:true}};window.addEventListener('message',event=>{if(event.data?.channel==='ctf-simple.capture-control'&&event.data.enabled)window.__captureReady=true;});</script><script src="/body-format.js"></script><script src="/network-tap.js"></script><script src="/response-bridge.js"></script><p>Native Fetch/XHR response capture fixture.</p>`); return;
    }
    if (url.pathname === '/__echo') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      res.statusCode = url.searchParams.get('status') === '403' ? 403 : 200;
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ method:req.method, url:req.url, check:req.headers['x-check'], body:Buffer.concat(chunks).toString('utf8') })); return;
    }
    if (url.pathname === '/__html') { res.setHeader('Content-Type','text/html'); res.end('<script>window.__ctfExecuted=1</script><h1>HTML demo response</h1>'); return; }
    if (url.pathname === '/response.html') {
      let html = await readFile(new URL('response.html',root),'utf8'); html = html.replace('</head>',`<script>${mockChrome('en')}</script></head>`);
      res.setHeader('Content-Type','text/html; charset=utf-8'); res.end(html); return;
    }
    if (url.pathname === '/zen-demo') {
      let html = await readFile(new URL('../docs/demo.html', root), 'utf8');
      html = html.replace('</head>', `<script>${mockChrome('en', true)}</script></head>`);
      html = html.replace('</body>', ['policy.js','i18n.js','scope.js','hints.js','content.js','dom-guard.js','page.js'].map(file => `<script src="/${file}"></script>`).join('') + '</body>');
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
    }
    const name = url.pathname.slice(1);
    if (files.has(name)) {
      res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(new URL(name, root))); return;
    }
    if (url.pathname === '/popup') {
      let html = await readFile(new URL('popup.html', root), 'utf8');
      html = html.replace('<script src="policy.js">', `<script>${mockChrome(url.searchParams.get('lang') === 'vi' ? 'vi' : 'en')}</script><script src="policy.js">`);
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return;
    }
    if (url.pathname.startsWith('/page')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(`<!doctype html><html><head><meta charset="utf-8"><title>CTF Simple demo</title><style>body{margin:0;font:16px system-ui;color:#27384a;background:#f4f6f8}main{max-width:900px;margin:28px auto;padding:28px;background:white;border-radius:12px}h1{margin-top:0}label{display:block;margin:14px 0}input,button{padding:10px;font:inherit;border:1px solid #ccd5dd;border-radius:6px}button{background:#275b42;color:white}pre{padding:15px;background:#edf4ef;border-radius:8px}.view-source{color:blue}.flag{color:green}</style><script>${mockChrome(url.searchParams.get('lang') === 'vi' ? 'vi' : 'en', true)}</script></head><body><main><h1>CTF Playground</h1><p>Synthetic demo data. No real tokens or credentials.</p><form><label>Username <input id="username" name="username" value="demo" required maxlength="8"></label><label>Password <input id="password" type="password" value="demo-password" required></label><input id="hidden-token" type="hidden" name="token" value="demo-token"><button type="button">Send request</button></form><h2>Response</h2><pre id="output">{ "status": "ok", "message": "demo response" }</pre><div id="static">Static page content</div></main>${['policy.js','i18n.js','scope.js','hints.js','content.js','dom-guard.js','page.js'].map(file => `<script src="/${file}"></script>`).join('')}</body></html>`); return;
    }
    res.statusCode = 404; res.end('Not found');
  } catch (error) { res.statusCode = 500; res.end(error.message); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
await writeFile(new URL('./demo-context.json', import.meta.url), JSON.stringify({ origin }));
console.log(`DEMO_READY ${origin}`);
