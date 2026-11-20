// Compatibility for response tabs opened by 3.3.0; current Raw Fetch renders inside the popup.
(() => {
  const $ = selector => document.querySelector(selector), controller = new AbortController();
  const t = (key, params) => CTFI18N.t(key, params);
  $('#stop').addEventListener('click', () => controller.abort());
  (async () => {
    try {
      const saved = await chrome.storage.local.get('language'); CTFI18N.setLanguage(saved.language || 'vi'); CTFI18N.apply(document);
      const key = location.hash.slice(1);
      if (!/^replay:[a-zA-Z0-9-]+$/.test(key)) throw new Error(t('Request không còn. Gửi lại từ popup.'));
      const stored = await chrome.runtime.sendMessage({ type:'takeReplay', key });
      if (stored?.error) throw new Error(stored.error);
      if (!stored?.job) throw new Error(t('Request không còn. Gửi lại từ popup.'));
      const result = await CTFReplay.send(stored.job.raw,stored.job.protocol,controller.signal);
      $('#target').textContent = `${result.method} ${result.url}`;
      $('#responseHeaders').textContent = result.headers.map(([name,value])=>`${name}: ${value}`).join('\n');
      $('#responseBody').textContent = CTFBody.format(result.body,result.contentType);
      $('#notice').textContent = [result.html ? t('Không hiển thị response HTML. Chỉ hỗ trợ nội dung không phải HTML.') : '',result.skipped.length ? t('Header do trình duyệt kiểm soát, không gửi nguyên bản: {headers}',{headers:result.skipped.join(', ')}) : '',result.truncated ? t('Chỉ hiển thị 2 MiB đầu của response.') : ''].filter(Boolean).join(' ');
      $('#summary').textContent = `${result.status} ${result.statusText} · ${result.ms} ms · ${result.bytes} B`;
      $('#summary').className = result.ok && !result.html ? '' : 'error';
    } catch (error) { $('#summary').textContent = controller.signal.aborted ? t('Đã dừng.') : t('Không gửi được request.'); $('#responseBody').textContent = error.message; }
    finally { $('#stop').hidden = true; }
  })();
})();
