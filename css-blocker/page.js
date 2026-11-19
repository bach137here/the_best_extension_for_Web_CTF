(() => {
  if (globalThis.CTFPage || globalThis.CTFPageReady) return;
  globalThis.CTFPageReady = (async () => {
  await globalThis.CTFScope?.ready;
  if (globalThis.CTFScope?.disabled) return;
  const t = (key, params) => globalThis.CTFI18N?.t(key, params) ?? key;
  const defaults = { passwords: true, reveal: true, unlock: true, textInputs: true, copy: true, urlBar: false };
  let prefs = { ...defaults }, ready = false, zen = false, timer, host, shadow, zenStyle;
  let urlDirty = false, resolveReady;
  let displayURL = '', lastLocation = '';
  const initialized = new Promise(resolve => { resolveReady = resolve; });
  let originals = new Map();
  let copyHandler;
  const hidden = new Set(), dynamic = new Set();
  let textMarkers = [];
  const zenToken = 'ctf-' + Math.random().toString(36).slice(2);
  const protectedUI = element => !!globalThis.CTFDOM?.isExtensionUI(element);
  const attributeFilter = ['type', 'disabled', 'readonly', 'required', 'pattern', 'min', 'max', 'minlength', 'maxlength', 'step', 'accept', 'hidden', 'inert', 'open', 'style', 'class', 'oncopy', 'oncut', 'onpaste', 'oncontextmenu', 'onselectstart', ...(globalThis.CTFDOM?.markerAttributes || [])];
  const observer = new MutationObserver(records => {
    if (zen) for (const record of records) {
      if (!['childList', 'characterData'].includes(record.type)) continue;
      const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (!element || protectedUI(element) || element.closest('head,script,style')) continue;
      const candidates = ['BODY', 'HTML'].includes(element.tagName) ? [...record.addedNodes].filter(node => node.nodeType === 1) : [element];
      for (const candidate of candidates) if (dynamic.size < 100 && !protectedUI(candidate) && !candidate.matches('script,style,link')) dynamic.add(candidate);
    }
    clearTimeout(timer); timer = setTimeout(refresh, 60);
  });
  function remember(element, name) {
    let attributes = originals.get(element);
    if (!attributes) { attributes = new Map(); originals.set(element, attributes); }
    if (!attributes.has(name)) attributes.set(name, element.getAttribute(name));
  }
  function attr(element, name, value = null) {
    if (element.getAttribute(name) === value) return;
    remember(element, name);
    if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
  }
  function style(element, name, value) {
    if (globalThis.CSSBlocker?.active) return;
    if (element.style.getPropertyValue(name) === value && element.style.getPropertyPriority(name) === 'important') return;
    remember(element, 'style'); element.style.setProperty(name, value, 'important');
  }
  function restoreHelpers() {
    for (const [element, attributes] of originals) for (const [name, value] of attributes) {
      if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
    }
    originals = new Map();
    if (copyHandler) for (const event of ['copy', 'cut', 'paste', 'contextmenu', 'selectstart']) window.removeEventListener(event, copyHandler, true);
    copyHandler = undefined;
  }
  function helpers() {
    // An injected root may receive its ownership marker after its children mount.
    for (const [element, attributes] of originals) if (protectedUI(element)) {
      for (const [name, value] of attributes) { if (value === null) element.removeAttribute(name); else element.setAttribute(name, value); }
      originals.delete(element);
    }
    for (const element of document.querySelectorAll('html,body,body *')) {
      if (element === host || protectedUI(element) || element.matches('script,style,link,meta,template,noscript')) continue;
      if (prefs.passwords && element.matches('input[type="password" i]')) attr(element, 'type', 'text');
      if (prefs.textInputs && element.matches('input') && ['email', 'url', 'number', 'date', 'time', 'datetime-local', 'month', 'week', 'range', 'color'].includes(element.type)) attr(element, 'type', 'text');
      if (prefs.unlock) {
        if (element.matches('input,textarea,select,button,fieldset,option,optgroup')) for (const name of ['disabled', 'readonly', 'required', 'pattern', 'min', 'max', 'minlength', 'maxlength', 'step', 'accept']) attr(element, name);
        if (element.matches('form')) attr(element, 'novalidate', '');
      }
      if (prefs.reveal && !hidden.has(element)) {
        attr(element, 'hidden'); attr(element, 'inert');
        if (element.matches('input[type="hidden" i]')) attr(element, 'type', 'text');
        if (element.matches('dialog,details')) attr(element, 'open', '');
        const computed = getComputedStyle(element);
        if (computed.display === 'none') style(element, 'display', 'block');
        if (['hidden', 'collapse'].includes(computed.visibility)) style(element, 'visibility', 'visible');
        if (computed.opacity === '0') style(element, 'opacity', '1');
      }
      if (prefs.copy) for (const name of ['oncopy', 'oncut', 'onpaste', 'oncontextmenu', 'onselectstart']) attr(element, name);
    }
    if (prefs.copy && !copyHandler) {
      copyHandler = event => { if (!protectedUI(event.target)) event.stopImmediatePropagation(); };
      for (const event of ['copy', 'cut', 'paste', 'contextmenu', 'selectstart']) window.addEventListener(event, copyHandler, true);
      if (document.documentElement) style(document.documentElement, 'user-select', 'text');
    }
  }
  function clearZen() {
    for (const element of hidden) if (element.getAttribute('data-ctf-zen') === zenToken) element.removeAttribute('data-ctf-zen');
    hidden.clear();
    for (const [marker, text] of textMarkers) if (marker.parentNode) marker.replaceWith(text);
    textMarkers = [];
  }
  function paintZen() {
    clearZen();
    if (!zen || !document.body) { zenStyle?.remove(); return; }
    if (!zenStyle) {
      zenStyle = document.createElement('style');
      zenStyle.textContent = `[data-ctf-zen="${zenToken}"]{display:none!important}`;
      globalThis.CSSBlocker?.keepStyle(zenStyle);
    }
    if (!zenStyle.isConnected) (document.head || document.documentElement).append(zenStyle);
    const seeds = new Set(document.querySelectorAll('form,input,textarea,select,button,label,output,pre,code,[role="button"],[role="status"],[role="alert"],[role="log"],[aria-live],iframe,[contenteditable]:not([contenteditable="false"]),[id*="result" i],[id*="response" i],[class~="result"],[class~="output"],[id*="flag" i],[class*="flag" i],[id*="secret" i],[class~="secret"]'));
    for (const element of dynamic) if (element.isConnected) seeds.add(element);
    const content = new Set(), keep = new Set([document.body, document.documentElement]);
    for (const element of document.body.querySelectorAll('*')) if (protectedUI(element)) {
      content.add(element);
      for (let parent = element; parent; parent = parent.parentElement) keep.add(parent);
    }
    for (const seed of seeds) {
      if (seed === host || protectedUI(seed) || !document.body.contains(seed)) continue;
      content.add(seed); for (const child of seed.querySelectorAll('*')) content.add(child);
      for (let element = seed; element; element = element.parentElement) keep.add(element);
    }
    for (const element of content) keep.add(element);
    for (const element of document.body.querySelectorAll('*')) {
      if (element === host || protectedUI(element) || element.matches('script,style,link') || keep.has(element)) continue;
      element.setAttribute('data-ctf-zen', zenToken); hidden.add(element);
    }
    // Static text directly in a kept ancestor cannot be hidden with an element selector.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const remove = [];
    let text;
    while ((text = walker.nextNode())) if (text.textContent.trim() && keep.has(text.parentElement) && !content.has(text.parentElement) && !text.parentElement.closest('script,style,ctf-toolbar')) remove.push(text);
    for (const text of remove) {
      const marker = document.createComment('CTF Zen'); text.replaceWith(marker); textMarkers.push([marker, text]);
    }
  }
  function overlay() {
    if (!prefs.urlBar && !zen) { host?.remove(); host = undefined; shadow = undefined; return; }
    if (!document.documentElement) return;
    if (!host) {
      urlDirty = false;
      host = document.createElement('ctf-toolbar');
      shadow = host.attachShadow({ mode: 'open' });
      const css = document.createElement('style');
      css.textContent = `:host{all:initial!important;display:block!important;position:sticky!important;top:0!important;left:0!important;right:0!important;z-index:2147483647!important;font:14px system-ui!important;color:#172033!important}*{box-sizing:border-box}section{display:flex;gap:6px;align-items:center;padding:8px;background:#f8fafc;border-bottom:1px solid #cbd5e1;box-shadow:0 2px 12px #0002}input{flex:1;min-width:50px;height:40px;padding:0 10px;font:14px Consolas,monospace;border:1px solid #b7c2d1;border-radius:6px;background:white;color:#111827}button{height:40px;border:1px solid #cbd5e1;border-radius:6px;background:white;color:#172033;padding:0 12px;cursor:pointer;font:14px system-ui}button:hover{background:#e2e8f0}#badge{margin-left:auto;font-size:13px}#notice{display:block;background:#fff4d0;padding:6px 12px;font:13px system-ui}[hidden]{display:none!important}`;
      globalThis.CSSBlocker?.keepStyle(css); shadow.append(css);
      const row = document.createElement('section'); shadow.append(row);
      const makeButton = (text, label, action) => { const button = document.createElement('button'); button.dataset.i18n = text; button.dataset.i18nTitle = label; button.dataset.i18nLabel = label; button.textContent = t(text); button.title = t(label); button.setAttribute('aria-label', t(label)); button.addEventListener('click', action); row.append(button); return button; };
      makeButton('←', 'Quay lại', () => history.back()).className = 'url';
      makeButton('↻', 'Tải lại', () => location.reload()).className = 'url';
      const input = document.createElement('input'); input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off'; input.setAttribute('autocapitalize', 'off'); input.value = displayURL; input.dataset.i18nPlaceholder = 'URL nguyên chuỗi · không tự encode'; input.dataset.i18nLabel = 'URL nguyên chuỗi'; input.placeholder = t(input.dataset.i18nPlaceholder); input.title = t('URL thực tế của Chrome: {url}', { url: location.href }); input.setAttribute('aria-label', t('URL nguyên chuỗi')); input.className = 'url'; row.append(input);
      input.addEventListener('input', () => { urlDirty = true; });
      const notice = document.createElement('span'); notice.id = 'notice'; notice.hidden = true; shadow.append(notice);
      const go = async () => {
        try {
          const raw = input.value, url = new URL(raw);
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error(t('Chỉ mở URL HTTP/HTTPS.'));
          const response = await chrome.runtime.sendMessage({ type: 'navigate', url: raw });
          if (response?.error) throw new Error(response.error);
        } catch (error) { notice.textContent = error.message; notice.hidden = false; }
      };
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); go(); } });
      makeButton('Mở', 'Mở nguyên chuỗi URL', go).className = 'url';
      makeButton('Copy', 'Copy URL nguyên chuỗi', async () => {
        try { await navigator.clipboard.writeText(input.value); }
        catch { input.focus(); input.select(); document.execCommand('copy'); }
      }).className = 'url';
      const badge = document.createElement('span'); badge.id = 'badge'; badge.textContent = 'Zen'; row.append(badge);
      makeButton('Tắt Zen', 'Tắt Zen', () => chrome.storage.local.set({ [`zen:${location.hostname}`]: false })).id = 'zenOff';
      makeButton('×', 'Ẩn thanh URL', () => chrome.storage.local.set({ prefs: { ...prefs, urlBar: false } })).id = 'close';
    }
    if (!host.isConnected) document.documentElement.insertBefore(host, document.body || null);
    for (const element of shadow.querySelectorAll('.url')) element.hidden = !prefs.urlBar;
    shadow.querySelector('#close').hidden = !prefs.urlBar;
    shadow.querySelector('#badge').hidden = !zen; shadow.querySelector('#zenOff').hidden = !zen;
    globalThis.CTFI18N?.apply(shadow);
  }
  function refresh() {
    if (!ready) return;
    observer.disconnect();
    try { helpers(); paintZen(); overlay(); }
    finally { observer.observe(document, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter }); }
  }
  globalThis.CTFPage = {
    ready: initialized,
    state: () => ({ prefs: { ...prefs }, zen, css: !!globalThis.CSSBlocker?.active, hints: globalThis.CTFHints?.list() || { names: [], unreadable: 0 } }),
    configure(next) { observer.disconnect(); restoreHelpers(); prefs = { ...prefs, ...next }; ready = true; refresh(); },
    setZen(on) { zen = !!on; if (!zen) dynamic.clear(); refresh(); }
  };
  chrome.storage.local.get(['prefs', `zen:${location.hostname}`]).then(saved => {
    prefs = { ...defaults, ...saved.prefs }; zen = !!saved[`zen:${location.hostname}`]; ready = true; refresh(); resolveReady();
  }).catch(() => { ready = true; refresh(); resolveReady(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.prefs) globalThis.CTFPage.configure({ ...defaults, ...changes.prefs.newValue });
    if (changes[`zen:${location.hostname}`]) globalThis.CTFPage.setZen(changes[`zen:${location.hostname}`].newValue);
    if (changes.language) { globalThis.CTFI18N?.setLanguage(changes.language.newValue || 'vi'); if (shadow) globalThis.CTFI18N?.apply(shadow); }
  });
  window.addEventListener('keydown', event => { if (prefs.urlBar && event.altKey && event.key.toLowerCase() === 'l') { event.preventDefault(); const input = shadow?.querySelector('input'); input?.focus(); input?.select(); } });
  async function syncAddress() {
    const actual = location.href;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'address', url: actual });
      if (location.href !== actual) return;
      displayURL = response?.raw ?? actual;
    } catch { displayURL = actual; }
    lastLocation = actual;
    const input = shadow?.querySelector('input');
    if (input && !urlDirty) { input.value = displayURL; input.title = t('URL thực tế của Chrome: {url}', { url: actual }); }
  }
  syncAddress();
  setInterval(() => { if (lastLocation !== location.href) syncAddress(); }, 1000);
  })();
})();
