globalThis.CTFBody = (() => {
  const maxInput = 2097152, maxOutput = 4194304, maxDepth = 64, maxNodes = 100000;
  function isHTML(contentType, text = '') {
    const mime = contentType.split(';')[0].trim().toLowerCase();
    if (mime === 'text/html' || mime === 'application/xhtml+xml' || mime.endsWith('+html')) return true;
    let offset = 0;
    while (offset < text.length) {
      while (offset < text.length && /\s/.test(text[offset])) offset++;
      if (text.startsWith('<!--',offset)) { const end = text.indexOf('-->',offset+4); if (end < 0) return true; offset = end+3; }
      else if (/^<\?xml\b/i.test(text.slice(offset,offset+8))) { const end = text.indexOf('?>',offset+5); if (end < 0) return true; offset = end+2; }
      else break;
    }
    const prefix = text.slice(offset,offset+256);
    if (mime === 'application/xml' || mime === 'text/xml' || mime.endsWith('+xml')) return /^<(?:!doctype\s+html|html)\b/i.test(prefix);
    return /^<(?:!doctype\s+html|html|head|body|title|meta|link|script|style|div|span|p|h[1-6]|form|input|button|table|ul|ol|li|a|img|iframe|section|main|header|footer|article|nav|aside|textarea|select|option|label|pre|code)\b/i.test(prefix);
  }
  function preview(bytes, contentType = '') {
    if (isHTML(contentType)) return { html: true, body: '' };
    const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1] || 'utf-8';
    let decoder; try { decoder = new TextDecoder(charset,{fatal:true}); } catch { decoder = new TextDecoder('utf-8',{fatal:true}); }
    let text, binary = false;
    try { text = decoder.decode(bytes); } catch { binary = true; text = new TextDecoder().decode(bytes.subarray(0,8192)); }
    if (isHTML(contentType,text)) return { html: true, body: '' };
    const mime = contentType.split(';')[0].trim().toLowerCase();
    const textual = mime.startsWith('text/') || ['application/json','application/xml','application/javascript','application/ecmascript','application/x-www-form-urlencoded','application/graphql','application/yaml','application/x-yaml'].includes(mime) || mime.endsWith('+json') || mime.endsWith('+xml');
    return { html: false, body: binary || text.includes('\0') || (mime && !textual) ? '[base64]\n' + btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')) : text };
  }
  function format(text, contentType = '') {
    if (!text || text.length > maxInput) return text;
    try {
      const value = JSON.parse(text), stack = [[value, 0]];
      let nodes = 0, budget = text.length;
      while (stack.length) {
        const [item, depth] = stack.pop();
        if (++nodes > maxNodes || depth > maxDepth) return text;
        if (item && typeof item === 'object') {
          budget += depth * 2 + 2;
          for (const key of Object.keys(item)) {
            budget += (depth + 1) * 2 + 4;
            if (budget > maxOutput || stack.length + nodes >= maxNodes) return text;
            stack.push([item[key], depth + 1]);
          }
        }
      }
      const result = JSON.stringify(value, null, 2);
      return result.length <= maxOutput ? result : text;
    } catch { /* Non-JSON bodies may be XML. */ }
    if (!text.trimStart().startsWith('<') || isHTML(contentType, text) || /<!DOCTYPE\b/i.test(text) ||
        typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') return text;
    try {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (!doc.documentElement || doc.getElementsByTagNameNS('*', 'parsererror').length) return text;
      let nodes = 0, budget = text.length;
      function indent(element, depth, preserve) {
        if (++nodes > maxNodes || depth > maxDepth) throw new Error('Formatting limit');
        const space = element.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'space');
        preserve = space === 'preserve' || (preserve && space !== 'default');
        const children = Array.from(element.childNodes);
        const mixed = preserve || children.some(node => node.nodeType === 4 || (node.nodeType === 3 && /\S/.test(node.data)));
        // Mixed content is serialized untouched: even whitespace adjacent to an inline element matters.
        if (mixed) return;
        for (const child of children) if (child.nodeType === 1) indent(child, depth + 1, preserve);
        if (!children.some(node => node.nodeType !== 3)) return;
        for (const child of children) {
          if (child.nodeType === 3) element.removeChild(child);
          else {
            const whitespace = '\n' + '  '.repeat(depth + 1);
            budget += whitespace.length;
            if (budget > maxOutput) throw new Error('Formatting limit');
            element.insertBefore(doc.createTextNode(whitespace), child);
          }
        }
        element.appendChild(doc.createTextNode('\n' + '  '.repeat(depth)));
      }
      indent(doc.documentElement, 0, false);
      const declaration = /^\s*(<\?xml\s[^?]*\?>)/i.exec(text)?.[1];
      const result = (declaration ? declaration + '\n' : '') + new XMLSerializer().serializeToString(doc);
      return result.length <= maxOutput ? result : text;
    } catch { return text; }
  }
  function tag(kind, value = '') {
    if (kind === 'none') return 'none';
    let first = 2166136261, second = 5381;
    for (let index=0; index<value.length; index++) { const code=value.charCodeAt(index); first=Math.imul(first^code,16777619); second=Math.imul(second,33)^code; }
    return `${kind}:${value.length}:${(first>>>0).toString(16)}:${(second>>>0).toString(16)}`;
  }
  return { format, isHTML, preview, tag };
})();
