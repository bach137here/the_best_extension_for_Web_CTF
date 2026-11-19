(() => {
  if (globalThis.CTFHints) return;
  const names = new Map();
  const unreadable = new Set();
  const important = name => /flag|view[-_]?source|(?:^|[-_])(?:source|secret|admin|debug|hint|token|key|pass|password|auth|backup|internal|config|challenge|ctf|solve|win)(?:[-_]|$)/i.test(name.slice(1));
  function scan(sheet, visited = new Set(), budget = { count: 0 }) {
    if (globalThis.CTFScope?.disabled || !sheet || visited.has(sheet)) return;
    visited.add(sheet);
    try {
      function walk(rules) {
        for (const rule of rules) {
          if (++budget.count > 10000 || names.size >= 2000) return;
          if (rule.selectorText) {
            const selector = rule.selectorText.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '');
            const hidden = /(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$))/i.test(rule.style?.cssText || '');
            for (const match of selector.matchAll(/[.#](?:\\.|[\w-])+/g)) {
              const name = match[0];
              const old = names.get(name);
              names.set(name, { name, important: important(name), hidden: hidden || !!old?.hidden });
            }
          }
          if (rule.styleSheet) scan(rule.styleSheet, visited, budget);
          else if (rule.cssRules) walk(rule.cssRules);
        }
      }
      walk(sheet.cssRules);
    } catch { unreadable.add(sheet.href || '(stylesheet không đọc được)'); }
  }
  function collect() {
    if (globalThis.CTFScope?.disabled) return;
    const visited = new Set(), budget = { count: 0 };
    for (const sheet of [...document.styleSheets, ...document.adoptedStyleSheets]) scan(sheet, visited, budget);
  }
  globalThis.CTFHints = {
    scan, collect,
    list() {
      if (globalThis.CTFScope?.disabled) return { names: [], unreadable: 0 };
      collect();
      return { names: [...names.values()].map(entry => {
        let used = false;
        try { used = !!document.querySelector(entry.name); } catch { /* Escaped selector. */ }
        return { ...entry, used };
      }).sort((a, b) => Number(b.important) - Number(a.important) || a.name.localeCompare(b.name)), unreadable: unreadable.size };
    }
  };
  let timer;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(collect, 100); };
  Promise.resolve(globalThis.CTFScope?.ready).then(() => {
    if (globalThis.CTFScope?.disabled) return;
    new MutationObserver(schedule).observe(document, { subtree: true, childList: true, characterData: true });
    document.addEventListener('load', schedule, true);
    collect();
  });
})();
