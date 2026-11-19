const $ = selector => document.querySelector(selector);
const prefBoxes = [...document.querySelectorAll('[data-pref]')];
const initialControls = [...document.querySelectorAll('[disabled]')];
let tab, prefs = {}, hints = { names: [], unreadable: 0 }, requests = [], lastRequests = '';
let rules = {}, enabled = false, lastStatus = 'Đang mở…';
let saving = Promise.resolve();
let refreshPageState = false;
const expandedRequests = new Set();
const t = (key, params) => globalThis.CTFI18N?.t(key, params) ?? key;
const status = (message, params) => { lastStatus = message; $('#status').textContent = t(message, params); };
function renderScope() {
  if (!tab) return;
  const keys = CTFPolicy.keys(tab.url);
  const reason = CTFPolicy.reason(tab.url, rules); enabled = !reason;
  $('#siteRule').textContent = t((rules.disabledSites || []).includes(keys.site) ? 'Bật cho trang này' : 'Tắt cho trang này');
  $('#endpointRule').textContent = t((rules.disabledEndpoints || []).includes(keys.endpoint) ? 'Bật cho endpoint này' : 'Tắt cho endpoint này');
  $('#siteRule').title = keys.site; $('#endpointRule').title = keys.endpoint;
  $('#scopeState').textContent = t(reason === 'site' ? 'Đã tắt cho trang này' : reason === 'endpoint' ? 'Đã tắt cho endpoint này' : 'Đang bật');
  $('#scopeState').className = reason ? 'paused' : '';
  document.body?.classList.toggle('is-paused', !enabled);
  for (const element of initialControls) element.disabled = !enabled && !['language', 'siteRule', 'endpointRule'].includes(element.id);
}
async function pageCall(func, args = []) {
  const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func, args });
  return results.find(entry => entry.frameId === 0)?.result;
}
function renderHints() {
  if (!enabled) { $('#hints').replaceChildren(); $('#hintCount').textContent = 0; return; }
  const mode = $('#hintFilter').value;
  const entries = hints.names.filter(entry => mode === 'all' || (mode === 'ctf' && entry.important) || (mode === 'unused' && !entry.used) || (mode === 'hidden' && entry.hidden));
  $('#hints').replaceChildren();
  for (const entry of entries) { const li = document.createElement('li'); li.textContent = entry.name; $('#hints').append(li); }
  if (!entries.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = t('Không có tên phù hợp bộ lọc.'); $('#hints').append(li); }
  $('#hintCount').textContent = entries.length;
  $('#hintNote').textContent = t('Chỉ tên class/id · chưa khớp ≠ không bao giờ dùng.') + (hints.unreadable ? t(' {count} stylesheet không đọc được.', { count: hints.unreadable }) : '');
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); status('Đã copy.'); }
  catch { $('#copyFallback').hidden = false; $('#copyFallback').value = text; $('#copyFallback').focus(); $('#copyFallback').select(); status('Dùng Ctrl+C để copy nội dung bên dưới.'); }
}
function renderRequests() {
  if (!enabled) {
    $('#requests').replaceChildren(); $('#requestCount').textContent = 0;
    $('#captureNote').textContent = t('Không áp dụng cho hostname/endpoint này.');
    const note = document.createElement('p'); note.className = 'empty'; note.textContent = t('Đã tắt công cụ trên trang này. Các thiết lập được giữ lại.'); $('#requests').append(note); return;
  }
  const search = $('#requestSearch').value.toLowerCase();
  const type = $('#requestType').value, method = $('#requestMethod').value;
  const content = $('#requestContent').value;
  const statusFilter = $('#requestStatus').value.trim().toLowerCase();
  const entries = requests.filter(entry => {
    if (tab && new URL(entry.url).hostname !== new URL(tab.url).hostname) return false;
    if (!`${entry.method} ${entry.url}`.toLowerCase().includes(search) || (method !== 'all' && entry.method !== method)) return false;
    if (statusFilter && statusFilter !== 'all') {
      if (['error', 'err'].includes(statusFilter)) { if (typeof entry.status !== 'string') return false; }
      else if (/^[1-5]xx$/.test(statusFilter)) { if (Math.floor(Number(entry.status) / 100) !== Number(statusFilter[0])) return false; }
      else if (String(entry.status) !== statusFilter) return false;
    }
    const mime = (entry.contentType || '').toLowerCase();
    if (content !== 'all') {
      const matches = { json: mime.includes('json'), html: mime.includes('html'), javascript: /javascript|ecmascript/.test(mime), css: mime === 'text/css', image: mime.startsWith('image/'), text: mime.startsWith('text/'), xml: mime.includes('xml'), media: /^(audio|video)\//.test(mime), font: /font|woff/.test(mime), unknown: !mime };
      if (!matches[content]) return false;
    }
    if (type === 'all') return true;
    if (type === 'api') return ['xmlhttprequest', 'ping'].includes(entry.type);
    if (type === 'document') return ['main_frame', 'sub_frame'].includes(entry.type);
    if (type === 'websocket') return entry.type === 'websocket';
    if (type === 'background') return entry.tabId === -1;
    return type === 'error' && (typeof entry.status === 'string' || Number(entry.status) >= 400);
  });
  $('#requestCount').textContent = requests.length;
  $('#requestCount').title = t('{count} đang hiện · {total} lượt đã ghi trong các nhóm này', { count: entries.length, total: requests.reduce((sum, entry) => sum + entry.count, 0) });
  $('#requests').replaceChildren();
  for (const entry of entries) {
    const row = document.createElement('div'); row.className = 'request';
    const main = document.createElement('div'); main.className = 'request-main';
    const method = document.createElement('span'); method.className = 'method'; method.textContent = entry.method; main.append(method);
    const url = document.createElement('div'); url.className = 'url'; url.title = entry.url;
    try { const parsed = new URL(entry.url); url.textContent = parsed.pathname + parsed.search; }
    catch { url.textContent = entry.url; }
    const urlCell = document.createElement('div'); urlCell.className = 'url-cell';
    const expand = document.createElement('button'); expand.className = 'expand-url';
    const detail = document.createElement('div'); detail.className = 'url-detail'; detail.textContent = url.textContent;
    const key = `${entry.method} ${entry.url}`;
    const updateExpanded = () => {
      const open = expandedRequests.has(key);
      detail.hidden = !open; expand.textContent = open ? '▴' : '▾';
      expand.setAttribute('aria-expanded', String(open));
      expand.title = expand.ariaLabel = t(open ? 'Thu gọn URL' : 'Mở rộng URL');
    };
    expand.addEventListener('click', () => {
      if (expandedRequests.has(key)) expandedRequests.delete(key); else expandedRequests.add(key);
      updateExpanded();
    });
    updateExpanded(); urlCell.append(url, expand); main.append(urlCell);
    const code = document.createElement('span');
    const numeric = Number(entry.status);
    code.className = 'status-code' + (typeof entry.status === 'string' || numeric >= 400 ? ' error' : numeric >= 300 ? ' redirect' : numeric >= 200 ? ' success' : '');
    code.textContent = typeof entry.status === 'string' ? 'ERR' : entry.status || '…'; code.title = String(entry.status || t('Đang tải')); main.append(code);
    const buttons = document.createElement('div'); buttons.className = 'buttons';
    for (const format of ['curl', 'curlCmd', 'raw']) {
      const button = document.createElement('button'); button.dataset.format = format;
      button.textContent = ({ curl: 'cURL', curlCmd: 'cURL CMD', raw: 'Raw' })[format] + (entry.body?.approximate ? ' ≈' : '');
      button.title = t(({ curl: 'Copy cURL cho Bash', curlCmd: 'Copy cURL cho Windows CMD (dán trực tiếp)', raw: 'Copy HTTP/1.1 tái dựng' })[format]) + (entry.body?.approximate ? t(' · Body form tái dựng, có thể khác encoding/thứ tự gốc') : '');
      if (/^wss?:/.test(entry.url)) { button.disabled = true; button.title = t('Đã ghi WebSocket handshake; đây không phải request HTTP để phát lại bằng cURL/raw.'); }
      button.addEventListener('click', () => { try { copy(CTFNetwork[format](entry)); } catch (error) { status(error.message); } }); buttons.append(button);
    }
    main.append(buttons); row.append(main, detail);
    const meta = document.createElement('p'); meta.className = 'meta';
    const kind = ({ xmlhttprequest: 'FETCH/XHR', main_frame: 'DOCUMENT', sub_frame: 'IFRAME', stylesheet: 'CSS', websocket: 'WS' })[entry.type] || (entry.type || 'request').toUpperCase();
    meta.textContent = [kind, entry.contentType || '', `${entry.count}×`, Number.isFinite(entry.duration) ? `${Math.round(entry.duration)} ms` : '', entry.fromCache ? 'cache' : '', entry.frameId > 0 ? `frame ${entry.frameId}` : '', entry.tabId === -1 ? t('SW/nền') : '', entry.headersKnown === false ? t('thiếu headers') : '', entry.body?.approximate ? 'body ≈' : '', entry.body?.truncated || entry.body?.missing ? t('thiếu body') : ''].filter(Boolean).join(' · ');
    meta.title = meta.textContent; row.append(meta); $('#requests').append(row);
  }
  if (!entries.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = t(requests.length ? 'Không có request khớp bộ lọc.' : 'Chưa có request. Bấm Reload & ghi để bắt lần tải trang.'); $('#requests').append(p); }
}
async function loadRequests(force = false) {
  if (!enabled) { requests = []; renderRequests(); return; }
  const response = await chrome.runtime.sendMessage({ type: 'requests', tabId: tab.id, pageUrl: tab.url });
  if (response?.error) throw new Error(response.error);
  $('#captureNote').textContent = response?.warning ? t('Có thể thiếu log do lỗi ghi: {error}. Xóa log để đặt lại cảnh báo.', { error: response.warning }) : t('Chỉ hostname hiện tại · cURL/raw giữ URL đầy đủ. Reload & ghi để bắt lần tải trang; memory cache có thể không xuất hiện.');
  const entries = (response?.entries || []).filter(entry => !CTFNetwork.isStatic(entry));
  const signature = JSON.stringify(entries);
  if (force || signature !== lastRequests) { requests = entries; lastRequests = signature; renderRequests(); }
}
async function refreshLive() {
  if (!enabled) return;
  if (refreshPageState) {
    const state = await pageCall(async () => { await globalThis.CTFPageReady; await globalThis.CTFPage?.ready; return globalThis.CTFPage?.state(); });
    if (state) {
      prefs = state.prefs; hints = state.hints; $('#zen').checked = state.zen;
      for (const box of prefBoxes) box.checked = !!prefs[box.dataset.pref];
      renderHints(); refreshPageState = false;
    }
  }
  await loadRequests();
}
const act = (task, allowPaused = false) => async () => { try { if (!enabled && !allowPaused) return status('Đã tắt công cụ trên trang này. Các thiết lập được giữ lại.'); await task(); } catch (error) { status(error.message); } };
$('#language').addEventListener('change', act(async () => {
  const language = $('#language').checked ? 'en' : 'vi';
  CTFI18N.setLanguage(language); await chrome.storage.local.set({ language }); CTFI18N.apply(document);
  renderScope(); renderHints(); renderRequests(); status(lastStatus);
  await loadRequests(true);
}, true));
for (const [id, setting, kind] of [['siteRule', 'disabledSites', 'site'], ['endpointRule', 'disabledEndpoints', 'endpoint']]) $("#" + id).addEventListener('click', act(async () => {
  const value = CTFPolicy.keys(tab.url)[kind];
  const existing = Array.isArray(rules[setting]) ? rules[setting] : [];
  rules[setting] = existing.includes(value) ? existing.filter(entry => entry !== value) : [...existing, value];
  await chrome.storage.local.set({ [setting]: rules[setting] });
  renderScope(); renderHints(); renderRequests(); status('Đang tải lại để áp dụng lựa chọn.');
  refreshPageState = true;
  if (enabled) await loadRequests(true);
}, true));
$('#block').addEventListener('click', act(async () => {
  await chrome.storage.local.set({ [`strong:${new URL(tab.url).hostname}`]: true });
  await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => globalThis.CSSBlocker.enable() });
  hints = await pageCall(() => globalThis.CTFHints.list()); renderHints(); status('CSS đã chặn · ghi nhớ qua refresh.');
}));
$('#restore').addEventListener('click', act(async () => { await chrome.storage.local.remove(`strong:${new URL(tab.url).hostname}`); await chrome.tabs.reload(tab.id); status('Đang tải lại để khôi phục CSS.'); }));
for (const box of prefBoxes) box.addEventListener('change', act(async () => {
  prefs = { ...prefs, [box.dataset.pref]: box.checked };
  const next = { ...prefs };
  saving = saving.catch(() => {}).then(() => chrome.storage.local.set({ prefs: next })); await saving;
  status(box.dataset.pref === 'urlBar' ? (box.checked ? 'Thanh URL đã hiện trên trang · Alt+L để nhập.' : 'Đã ẩn thanh URL.') : 'Đã lưu lựa chọn.');
}));
$('#zen').addEventListener('change', act(async () => { await chrome.storage.local.set({ [`zen:${new URL(tab.url).hostname}`]: $('#zen').checked }); status($('#zen').checked ? 'Zen: giữ điều khiển và kết quả; ẩn phần tĩnh.' : 'Đã tắt Zen.'); }));
$('#hintFilter').addEventListener('change', renderHints);
$('#requestSearch').addEventListener('input', renderRequests);
$('#requestType').addEventListener('change', renderRequests);
$('#requestMethod').addEventListener('change', renderRequests);
$('#requestContent').addEventListener('change', renderRequests);
$('#requestStatus').addEventListener('input', renderRequests);
$('#reload').addEventListener('click', act(async () => { await chrome.tabs.reload(tab.id, { bypassCache: true }); status('Đang tải lại, bỏ qua cache để ghi requests.'); }));
$('#refresh').addEventListener('click', act(async () => { hints = await pageCall(() => globalThis.CTFHints.list()); renderHints(); await loadRequests(true); status('Đã làm mới.'); }));
$('#clear').addEventListener('click', act(async () => { const response = await chrome.runtime.sendMessage({ type: 'clearRequests', tabId: tab.id, pageUrl: tab.url }); if (response?.error) throw new Error(response.error); await loadRequests(true); status('Đã xóa request của tab và nền cùng origin.'); }));
(async () => {
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Mở một trang web HTTP/HTTPS để dùng.');
    const saved = await chrome.storage.local.get(['disabledSites', 'disabledEndpoints', 'language', 'prefs', `zen:${url.hostname}`]);
    rules = saved; enabled = !CTFPolicy.isDisabled(tab.url, rules);
    setInterval(() => refreshLive().catch(() => {}), 1500);
    globalThis.CTFI18N?.setLanguage(saved.language || 'vi'); $('#language').checked = saved.language === 'en'; globalThis.CTFI18N?.apply(document);
    $('#site').textContent = url.host;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['policy.js', 'i18n.js', 'scope.js'] });
    await pageCall(async () => { await globalThis.CTFScope?.ready; });
    if (!enabled) {
      refreshPageState = true;
      prefs = { passwords: true, reveal: true, unlock: true, textInputs: true, copy: true, urlBar: false, ...saved.prefs };
      for (const box of prefBoxes) box.checked = !!prefs[box.dataset.pref]; $('#zen').checked = !!saved[`zen:${url.hostname}`];
      renderScope(); renderHints(); renderRequests(); status('Đã tắt công cụ trên trang này. Các thiết lập được giữ lại.'); return;
    }
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['hints.js', 'content.js', 'dom-guard.js', 'page.js'] });
    const state = await pageCall(async () => { await globalThis.CTFPageReady; await globalThis.CTFPage.ready; return globalThis.CTFPage.state(); });
    prefs = state.prefs; hints = state.hints; $('#zen').checked = state.zen;
    for (const box of prefBoxes) box.checked = !!prefs[box.dataset.pref];
    renderHints();
    try { await loadRequests(true); } catch (error) { $('#requests').textContent = t('Không đọc được requests: {error}', { error: error.message }); }
    renderScope();
    status(state.css ? 'CSS đang bị chặn · refresh vẫn giữ.' : 'Sẵn sàng · hỗ trợ form đã tự áp dụng.');
  } catch (error) { status(error.message); }
})();
