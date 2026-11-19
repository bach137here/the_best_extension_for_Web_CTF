globalThis.CTFNetwork = (() => {
  const staticTypes = new Set(['stylesheet', 'script', 'image', 'font', 'media', 'object']);
  const isStatic = request => staticTypes.has(request.type);
  const fail = key => new Error(globalThis.CTFI18N?.t(key) ?? key);
  const quote = value => "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
  function body(input) {
    if (!input) return undefined;
    if (input.error) return { missing: true, note: input.error };
    if (input.raw) {
      const total = input.raw.reduce((sum, part) => sum + (part.bytes?.byteLength || 0), 0);
      const bytes = new Uint8Array(Math.min(total, 65536));
      let offset = 0;
      for (const part of input.raw) if (part.bytes && offset < bytes.length) {
        const slice = new Uint8Array(part.bytes).subarray(0, bytes.length - offset);
        bytes.set(slice, offset); offset += slice.length;
      }
      const extra = { truncated: total > bytes.length, missing: input.raw.some(part => !part.bytes) };
      try {
        if (bytes.includes(0)) throw new Error('binary');
        return { text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), ...extra };
      } catch {
        return { base64: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')), ...extra };
      }
    }
    if (input.formData) {
      const pairs = Object.entries(input.formData).flatMap(([key, values]) => values.map(value => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`));
      const text = pairs.join('&');
      return { text: text.slice(0, 65536), approximate: true, truncated: text.length > 65536 };
    }
    return { missing: true };
  }
  const identity = entry => JSON.stringify([entry.tabId, entry.method, entry.url, entry.body?.text !== undefined ? ['text', entry.body.text] : entry.body?.base64 !== undefined ? ['base64', entry.body.base64] : [entry.body ? 'unavailable' : 'none'], !!entry.body?.missing, !!entry.body?.truncated, !!entry.body?.approximate]);
  function groupEndpoints(entries) {
    const groups = new Map();
    for (const entry of [...entries].sort((a, b) => (b.time || 0) - (a.time || 0))) {
      const url = new URL(entry.url);
      const key = JSON.stringify([entry.method, url.origin, url.pathname]);
      const group = groups.get(key);
      if (group) { group.variants.push(entry); group.count += entry.count || 1; }
      else groups.set(key, { ...entry, count: entry.count || 1, variants: [entry] });
    }
    return [...groups.values()];
  }
  function upsert(entries, request) {
    const key = identity(request);
    const index = entries.findIndex(entry => identity(entry) === key);
    const old = index >= 0 ? entries.splice(index, 1)[0] : undefined;
    const sameLifecycle = request.rid && old?.rid === request.rid;
    entries.push({ ...request, count: (old?.count || 0) + (sameLifecycle ? 0 : 1), firstTime: old?.firstTime || request.time });
    // Keep session memory bounded across tabs, including large request payloads.
    while (entries.length > 1000 || (entries.length > 1 && JSON.stringify(entries).length > 3000000)) entries.shift();
    return entries;
  }
  function validate(request) {
    const url = new URL(request.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw fail('Chỉ xuất request HTTP/HTTPS.');
    if (request.body?.truncated || request.body?.missing) throw fail('Body không đầy đủ; không thể xuất request chính xác.');
    if (request.body?.approximate && !request.headers?.some(header => header.name.toLowerCase() === 'content-type' && header.value?.toLowerCase().startsWith('application/x-www-form-urlencoded'))) throw fail('Body multipart/form thiếu bytes gốc; không thể xuất chính xác.');
    return url;
  }
  const optionalHeaders = new Set(['accept-encoding', 'accept-language', 'user-agent', 'cache-control', 'pragma', 'priority', 'dnt', 'upgrade-insecure-requests', 'connection', 'keep-alive', 'proxy-connection', 'te', 'trailer']);
  function headers(request, mode) {
    return (request.headers || []).filter(header => {
      const name = header.name.toLowerCase();
      if (name.startsWith(':') || ['host', 'content-length', 'transfer-encoding'].includes(name)) return false;
      return mode === 'full' || (!optionalHeaders.has(name) && !/^sec-(?:fetch-|ch-ua(?:-|$))/.test(name));
    });
  }
  function curl(request, mode = 'minimal') {
    validate(request);
    const args = ['curl --globoff --path-as-is', '--request ' + quote(request.method), '--url ' + quote(request.url)];
    const selected = headers(request, mode);
    for (const header of selected) args.push('--header ' + quote(`${header.name}: ${header.value || ''}`));
    if (selected.some(header => header.name.toLowerCase() === 'accept-encoding')) args.push('--compressed');
    let prefix = '';
    if (request.body?.base64 !== undefined) {
      prefix = `printf '%s' ${quote(request.body.base64)} | base64 --decode | `;
      args.push('--data-binary @-');
    } else if (request.body?.text !== undefined) args.push('--data-raw ' + quote(request.body.text));
    const note = (request.headersKnown === false ? '# Chrome khong cung cap headers goc; request nay chi la ban tai dung.\n' : '') + (request.body?.approximate ? '# Body form tai dung: encoding/thu tu goc co the khac.\n' : '');
    return note + prefix + args.join(' \\\n  ');
  }
  function raw(request, mode = 'minimal') {
    const url = validate(request);
    if (request.body?.base64 !== undefined) throw fail('Body binary: dùng Copy cURL để giữ nguyên bytes.');
    const text = request.body?.text;
    const lines = [`${request.method} ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`];
    for (const header of headers(request, mode)) lines.push(`${header.name}: ${header.value || ''}`);
    if (text !== undefined) lines.push('Content-Length: ' + new TextEncoder().encode(text).length);
    return lines.join('\r\n') + '\r\n\r\n' + (text || '');
  }
  function curlCmd(request, mode = 'minimal') {
    validate(request);
    function cmdQuote(value) {
      const text = String(value);
      if (/[\x00-\x1f\x7f]/.test(text)) throw fail('Header/URL chứa ký tự điều khiển không dùng trực tiếp trong CMD.');
      // Quote for the Windows C runtime, then protect that text from cmd.exe.
      const crt = '"' + text.replace(/(\\*)"/g, (_, slashes) => slashes + slashes + '\\"').replace(/(\\+)$/, '$1$1') + '"';
      return crt.replace(/[^a-zA-Z0-9 _\-:=+~'\/.,?;*]/g, '^$&').replace(/%(?=[a-zA-Z0-9_])/g, '%^');
    }
    const args = ['curl.exe --globoff --path-as-is', '--request ' + cmdQuote(request.method), '--url ' + cmdQuote(request.url)];
    const selected = headers(request, mode);
    for (const header of selected) args.push('--header ' + cmdQuote(`${header.name}: ${header.value || ''}`));
    if (selected.some(header => header.name.toLowerCase() === 'accept-encoding')) args.push('--compressed');
    let prefix = '';
    if (request.body?.base64 !== undefined || /[^\x20-\x7e]/.test(request.body?.text || '')) {
      const encoded = request.body.base64 ?? btoa(Array.from(new TextEncoder().encode(request.body.text), byte => String.fromCharCode(byte)).join(''));
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw fail('Body base64 không hợp lệ.');
      // Raw stdout avoids PowerShell's text encoding/newline transformations.
      prefix = `powershell.exe -NoProfile -NonInteractive -Command "$ctfBody=[Convert]::FromBase64String('${encoded}');[Console]::OpenStandardOutput().Write($ctfBody,0,$ctfBody.Length)" | `;
      args.push('--data-binary @-');
    } else if (request.body?.text !== undefined) args.push('--data-raw ' + cmdQuote(request.body.text));
    const command = prefix + args.join(' ^\r\n  ');
    if (command.length > 8000) throw fail('Lệnh quá dài cho CMD; dùng cURL Bash hoặc lưu request vào file.');
    const note = (request.headersKnown === false ? 'REM Chrome khong cung cap headers goc; day la request tai dung.\r\n' : '') + (request.body?.approximate ? 'REM Body form tai dung; encoding/thu tu goc co the khac.\r\n' : '');
    return note + command;
  }
  return { body, identity, upsert, curl, curlCmd, raw, isStatic, groupEndpoints };
})();
