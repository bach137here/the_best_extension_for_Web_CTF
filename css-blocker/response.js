(() => {
  const $ = selector => document.querySelector(selector);
  const t = (key, params) => CTFI18N.t(key, params);
  const controller = new AbortController(); let timedOut = false;
  $('#stop').addEventListener('click', () => controller.abort());
  (async () => {
    let timer;
    try {
      const saved = await chrome.storage.local.get('language'); CTFI18N.setLanguage(saved.language || 'vi'); CTFI18N.apply(document);
      const key = location.hash.slice(1);
      if (!/^replay:[a-zA-Z0-9-]+$/.test(key)) throw new Error(t('Request không còn. Gửi lại từ popup.'));
      const stored = await chrome.runtime.sendMessage({ type:'takeReplay', key }), job = stored?.job;
      if (stored?.error) throw new Error(stored.error);
      if (!job) throw new Error(t('Request không còn. Gửi lại từ popup.'));
      // The background claims each job once, even if two response tabs open concurrently.
      const request = CTFReplay.parse(job.raw, job.protocol);
      $('#target').textContent = `${request.method} ${request.url}`;
      if (request.skipped.length) $('#notice').textContent = t('Header do trình duyệt kiểm soát, không gửi nguyên bản: {headers}', { headers: request.skipped.join(', ') });
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
      const start = performance.now();
      const response = await fetch(request.url, { method:request.method, headers:request.headers, body:request.body, credentials:'include', redirect:'follow', signal:controller.signal });
      $('#responseHeaders').textContent = [...response.headers].map(([name,value]) => `${name}: ${value}`).join('\n');
      const chunks = []; let length = 0, truncated = false;
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          const take = value.subarray(0, 2097152 - length); chunks.push(take); length += take.length;
          if (take.length < value.length) { truncated = true; await reader.cancel(); break; }
        }
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(response.headers.get('content-type') || '')?.[1] || 'utf-8';
      let decoder; try { decoder = new TextDecoder(charset); } catch { decoder = new TextDecoder(); }
      $('#responseBody').textContent = decoder.decode(bytes); // Never execute HTML or scripts from the response.
      $('#summary').textContent = `${response.status} ${response.statusText} · ${Math.round(performance.now()-start)} ms · ${length.toLocaleString()} B`;
      $('#summary').className = response.ok ? '' : 'error';
      if (response.redirected) $('#target').textContent += ` → ${response.url}`;
      if (truncated) $('#notice').textContent += ' ' + t('Chỉ hiển thị 2 MiB đầu của response.');
    } catch (error) {
      $('#summary').textContent = t(timedOut ? 'Hết thời gian chờ (30 giây).' : controller.signal.aborted ? 'Đã dừng.' : 'Không gửi được request.');
      $('#summary').className = 'error';
      if (!controller.signal.aborted) $('#responseBody').textContent = error.message;
    } finally { clearTimeout(timer); $('#stop').hidden = true; }
  })();
})();
