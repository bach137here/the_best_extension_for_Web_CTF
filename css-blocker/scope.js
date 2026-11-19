(() => {
  if (globalThis.CTFScope) return;
  const state = { disabled: true, url: '', settings: {}, ready: null };
  globalThis.CTFScope = state;
  const topLevel = globalThis.top === globalThis;
  let reloading = false;
  function update() {
    const next = !state.url || globalThis.CTFPolicy.isDisabled(state.url, state.settings);
    if (topLevel && next !== state.disabled && !reloading) {
      reloading = true;
      location.reload(); // Reload restores CSS and any DOM edits before pausing/resuming.
    }
    state.disabled = next;
  }
  state.ready = (async () => {
    state.settings = await chrome.storage.local.get(['disabledSites', 'disabledEndpoints', 'language']);
    globalThis.CTFI18N?.setLanguage(state.settings.language || 'vi');
    try { state.url = globalThis.top.location.href; }
    catch {
      try { state.url = (await chrome.runtime.sendMessage({ type: 'scopeContext' }))?.url || ''; }
      catch { state.url = ''; }
    }
    state.disabled = !state.url || globalThis.CTFPolicy.isDisabled(state.url, state.settings);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      for (const name of ['disabledSites', 'disabledEndpoints', 'language']) if (changes[name]) state.settings[name] = changes[name].newValue;
      if (changes.language) globalThis.CTFI18N?.setLanguage(changes.language.newValue || 'vi');
      if (changes.disabledSites || changes.disabledEndpoints) { if (topLevel) state.url = location.href; update(); }
    });
    if (topLevel) setInterval(() => {
      if (state.url !== location.href) { state.url = location.href; update(); }
    }, 300);
    return state;
  })().catch(() => state); // If context/permissions fail, leave features off.
})();
