(() => {
  if (globalThis.CTFPolicy) return;
  function keys(value) {
    const url = new URL(value);
    return { site: url.hostname, endpoint: url.hostname + url.pathname };
  }
  function reason(value, settings = {}) {
    try {
      const target = keys(value);
      if (Array.isArray(settings.disabledSites) && settings.disabledSites.includes(target.site)) return 'site';
      if (Array.isArray(settings.disabledEndpoints) && settings.disabledEndpoints.includes(target.endpoint)) return 'endpoint';
    } catch { /* Non-web URLs do not match user exclusion rules. */ }
    return null;
  }
  globalThis.CTFPolicy = { keys, reason, isDisabled: (value, settings) => !!reason(value, settings) };
})();
