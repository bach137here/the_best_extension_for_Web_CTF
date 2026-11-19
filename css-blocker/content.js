(() => {
  if (globalThis.CSSBlocker) return;
  let active = false;
  const roots = new Set();
  const ownedStyles = new WeakSet();
  const observer = new MutationObserver(records => {
    if (!active) return;
    for (const record of records) {
      if (record.type === 'attributes') clean(record.target);
      else for (const node of record.addedNodes) scan(node);
    }
  });

  function clean(element) {
    if (element.nodeType !== 1) return;
    if (ownedStyles.has(element)) return;
    if (element.localName === 'style' ||
        (element.localName === 'link' && element.relList.contains('stylesheet'))) {
      globalThis.CTFHints?.scan(element.sheet);
      element.remove();
      return;
    }
    if (element.hasAttribute('style')) element.removeAttribute('style');
    if (element.shadowRoot) watch(element.shadowRoot);
  }

  function scan(node) {
    clean(node);
    if (node.querySelectorAll) for (const element of node.querySelectorAll('*')) clean(element);
  }

  function watch(root) {
    if (!roots.has(root)) {
      roots.add(root);
      observer.observe(root, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['style', 'rel'] });
      scan(root);
    }
    if (root.adoptedStyleSheets?.length) root.adoptedStyleSheets = [];
  }

  globalThis.CSSBlocker = {
    get active() { return active; },
    keepStyle(element) {
      // Isolated-world WeakSet: page-supplied attributes cannot grant an exemption.
      if (element.localName === 'style') ownedStyles.add(element);
    },
    enable() {
      if (active || globalThis.CTFScope?.disabled) return;
      globalThis.CTFHints?.collect();
      active = true;
      watch(document);
      // CSSOM changes and attachShadow() do not trigger MutationObserver.
      // ponytail: poll open shadow roots; closed roots need main-world hooks.
      setInterval(() => {
        for (const root of roots) {
          if (root.host && !root.host.isConnected) { roots.delete(root); continue; }
          watch(root);
          for (const element of root.querySelectorAll('*')) {
            if (element.shadowRoot) watch(element.shadowRoot);
          }
        }
      }, 500);
    }
  };

  // In Chrome, the last ancestor origin is the top-level page's origin.
  const ancestors = location.ancestorOrigins;
  let hostname = location.hostname;
  try {
    if (ancestors?.length) hostname = new URL(ancestors[ancestors.length - 1]).hostname;
  } catch { /* Sandboxed opaque origins may be reported as "null". */ }
  (async () => {
    await globalThis.CTFScope?.ready;
    if (globalThis.CTFScope?.disabled) return;
    const saved = await chrome.storage.local.get(`strong:${hostname}`);
    if (saved[`strong:${hostname}`]) globalThis.CSSBlocker.enable();
  })().catch(() => { /* Extension reloaded/removed: the next navigation resets CSS. */ });
})();
