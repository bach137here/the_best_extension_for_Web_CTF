(() => {
  if (globalThis.CSSBlocker) return;
  let active = false;
  const roots = new Set();
  const ownedStyles = new WeakSet();
  const sizedMedia = new WeakSet();
  const safetyStyles = new WeakMap();
  // Canvas dimension attributes reset its bitmap, so only cap it with CSS.
  const mediaSelector = 'img, svg, video';
  const observer = new MutationObserver(records => {
    if (!active) return;
    // Measure the whole batch before removing any styles that affect its media.
    for (const record of records) {
      if (record.type === 'attributes') preserveMedia(record.target);
      else for (const node of record.addedNodes) preserveMedia(node);
    }
    for (const record of records) {
      if (record.type === 'attributes') clean(record.target);
      else for (const node of record.addedNodes) scan(node);
    }
    for (const root of roots) ensureSafetyStyle(root);
  });

  function preserveMedia(node) {
    if (node.nodeType === 1) {
      if (node.matches(mediaSelector) && !sizedMedia.has(node) &&
          !(node.localName === 'svg' && node.parentElement?.closest('svg'))) {
        const { width, height } = node.getBoundingClientRect();
        if (width > 0 && height > 0) {
          node.setAttribute('width', Math.max(1, Math.round(width)));
          node.setAttribute('height', Math.max(1, Math.round(height)));
          sizedMedia.add(node);
        }
      }
      if (node.shadowRoot) preserveMedia(node.shadowRoot);
    }
    if (node.children) for (const child of node.children) preserveMedia(child);
  }

  function ensureSafetyStyle(root) {
    // A detached toolbar's style is never isConnected; reinserting it loops forever.
    if (root.host && !root.host.isConnected) return;
    if (safetyStyles.get(root)?.isConnected) return;
    const parent = root === document ? document.head || document.documentElement : root;
    if (!parent) return; // document_start can run before <html> exists.
    const style = document.createElement('style');
    style.textContent = `
      :is(img, svg, video, canvas):not(svg svg) {
        max-width: min(100%, 640px) !important;
        max-height: 360px !important;
        object-fit: contain !important;
      }
      :where(:is(img, svg, video, canvas):not(svg svg):not([height])) { height: auto; }
      :where(svg:not(svg svg):not([width]):not([height])) { width: 32px; height: 32px; }
    `;
    ownedStyles.add(style);
    safetyStyles.set(root, style);
    parent.append(style);
  }

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
      preserveMedia(root);
      roots.add(root);
      observer.observe(root, { subtree: true, childList: true, attributes: true,
        attributeFilter: ['style', 'rel'] });
      scan(root);
    }
    if (root.adoptedStyleSheets?.length) root.adoptedStyleSheets = [];
    ensureSafetyStyle(root);
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
