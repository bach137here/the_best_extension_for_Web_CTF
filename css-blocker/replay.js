globalThis.CTFReplay = (() => {
  const fail = key => new Error(globalThis.CTFI18N?.t(key) ?? key);
  const forbidden = new Set(['accept-charset','accept-encoding','access-control-request-headers','access-control-request-method','connection','content-length','cookie','cookie2','date','dnt','expect','host','keep-alive','origin','permissions-policy','referer','te','trailer','transfer-encoding','upgrade','user-agent','via']);
  const token = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
  function parse(raw, protocol = 'https:') {
    if (!['https:', 'http:'].includes(protocol)) throw fail('Chỉ hỗ trợ HTTP/HTTPS.');
    const boundary = /\r?\n\r?\n/.exec(raw);
    const head = boundary ? raw.slice(0, boundary.index) : raw;
    const body = boundary ? raw.slice(boundary.index + boundary[0].length) : '';
    const lines = head.split(/\r?\n/);
    const first = /^(\S+)[ \t]+(\S+)[ \t]+HTTP\/(?:1\.[01]|2(?:\.0)?)$/.exec(lines.shift() || '');
    if (!first || !token.test(first[1])) throw fail('Dòng đầu cần có dạng GET /path HTTP/1.1.');
    const method = first[1], upper = method.toUpperCase();
    if (['CONNECT','TRACE','TRACK'].includes(upper)) throw fail('Fetch không hỗ trợ method này. Dùng cURL hoặc Raw.');
    if (['GET','HEAD'].includes(upper) && body) throw fail('Fetch không gửi body với GET/HEAD. Dùng cURL hoặc Raw.');
    const headers = [], skipped = []; let host;
    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon < 1 || !token.test(line.slice(0, colon)) || /[\x00-\x08\x0a-\x1f\x7f]/.test(line)) throw fail('Header không hợp lệ.');
      const name = line.slice(0, colon), value = line.slice(colon + 1).trim(), lower = name.toLowerCase();
      if (lower === 'transfer-encoding') throw fail('Fetch không gửi Raw dạng Transfer-Encoding; hãy giải mã body trước.');
      if (lower === 'host') { if (host !== undefined) throw fail('Chỉ dùng một header Host.'); host = value; }
      const unsafeMethodOverride = ['x-http-method','x-http-method-override','x-method-override'].includes(lower) && /(?:^|[,\s])(?:CONNECT|TRACE|TRACK)(?:$|[,\s])/i.test(value);
      if (forbidden.has(lower) || /^(sec-|proxy-)/.test(lower) || unsafeMethodOverride) skipped.push(name);
      else headers.push([name, value]);
    }
    let url;
    if (/^https?:\/\//i.test(first[2])) url = new URL(first[2]);
    else {
      if (!host || /[\/\\\s@?#]/.test(host) || !first[2].startsWith('/')) throw fail('Cần header Host hợp lệ hoặc URL HTTP/HTTPS tuyệt đối.');
      const origin = new URL(protocol + '//' + host).origin;
      // Concatenation keeps //path an origin-form path instead of changing the host.
      url = new URL(origin + first[2]);
    }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw fail('Chỉ hỗ trợ HTTP/HTTPS.');
    return { url: url.href, method, headers, body: ['GET','HEAD'].includes(upper) ? undefined : new TextEncoder().encode(body), skipped: [...new Set(skipped)] };
  }
  const isHTML = (type,text) => CTFBody.isHTML(type,text);
  async function send(raw, protocol, signal) {
    const request = parse(raw, protocol), controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once:true });
    const timer = setTimeout(() => { timedOut = true; abort(); }, 30000), start = Date.now();
    try {
      const response = await fetch(request.url, { method:request.method, headers:request.headers, body:request.body, credentials:'include', redirect:'follow', signal:controller.signal });
      const type = response.headers.get('content-type') || '';
      const result = { status:response.status, statusText:response.statusText, ok:response.ok, url:response.url || request.url, method:request.method, contentType:type, headers:[...response.headers], skipped:request.skipped, bytes:0, body:'', html:false, truncated:false };
      if (isHTML(type)) { await response.body?.cancel(); return { ...result, html:true, ms:Date.now()-start }; }
      const chunks = [];
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          const take = value.subarray(0,2097152-result.bytes); chunks.push(take); result.bytes += take.length;
          if (take.length < value.length) { result.truncated = true; await reader.cancel(); break; }
        }
      }
      const bytes = new Uint8Array(result.bytes); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
      return { ...result, ...CTFBody.preview(bytes,type), ms:Date.now()-start };
    } catch (error) { if (timedOut) throw fail('Hết thời gian chờ (30 giây).'); throw error; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
  }
  return { parse, isHTML, send };
})();
