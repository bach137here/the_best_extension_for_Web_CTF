(() => {
  if (globalThis.CTFDOM) return;
  const tags = new Set(['ctf-toolbar', 'plasmo-csui', 'wxt-root', 'grammarly-desktop-integration']);
  const rootAttributes = ['data-extension-id', 'data-extension-root', 'data-lastpass-root', 'data-lastpass-icon-root', 'data-1password-root', 'data-bitwarden-root', 'data-grammarly-shadow-root'];
  const rootIds = new Set(['plasmo-shadow-container', 'code-formatter', 'code-formatter-root', 'code-formatter-container', 'code-formatter-toolbar', 'code-formatter-renderer', 'codeFormatter']);
  // Editors use intentionally hidden textareas for keyboard/clipboard handling.
  const editorClasses = new Set(['CodeMirror', 'cm-editor', 'ace_editor', 'monaco-editor', 'code-formatter', 'code-formatter-root', 'code-formatter-container', 'code-formatter-toolbar', 'code-formatter-renderer']);
  function isExtensionUI(element) {
    for (let node = element; node; node = node.parentElement || node.getRootNode?.()?.host) {
      if (!node.localName) continue;
      if (tags.has(node.localName) || /^(?:com-bitwarden-|com-1password-|onepassword-|lt-|deepl-)/.test(node.localName)) return true;
      if (node.shadowRoot || rootAttributes.some(name => node.hasAttribute(name))) return true;
      if (rootIds.has(node.getAttribute('id')) || /^__plasmo/.test(node.getAttribute('id') || '')) return true;
      const classes = (node.getAttribute('class') || '').split(/\s+/);
      if (classes.some(name => editorClasses.has(name))) return true;
      // Code Formatter 1.7.0 toggles a plain original <pre> under this body.
      if (node.localName === 'body' && classes.includes('code-formatter-is-loaded')) return true;
      if (['src', 'href'].some(name => /^(?:chrome|moz|safari-web)-extension:\/\//i.test(node.getAttribute(name) || ''))) return true;
    }
    return false;
  }
  globalThis.CTFDOM = { isExtensionUI, markerAttributes: [...rootAttributes, 'id', 'src', 'href'] };
})();
