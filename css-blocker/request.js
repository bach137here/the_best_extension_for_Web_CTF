(() => {
  const $ = selector => document.querySelector(selector);
  const t = (key, params) => CTFI18N.t(key, params);
  let active;
  $('#closeRaw').addEventListener('click', () => $('#rawEditor').close());
  $('#rawEditor').addEventListener('close', () => active?.abort());
  $('#stopRaw').addEventListener('click', () => active?.abort());
  $('#rawRequest').addEventListener('input', () => { $('#rawError').textContent = ''; });
  $('#send').addEventListener('click', async () => {
    try {
      $('#rawError').textContent = ''; $('#rawResult').hidden = true;
      $('#send').disabled = true; $('#stopRaw').hidden = false;
      active = new AbortController();
      $('#rawError').textContent = t('Đang gửi…');
      const result = await CTFReplay.send($('#rawRequest').value, $('#protocol').value, active.signal);
      $('#rawSummary').textContent = `${result.status} ${result.statusText} · ${result.ms} ms · ${result.bytes.toLocaleString()} B`;
      $('#rawSummary').className = result.ok && !result.html ? '' : 'error';
      $('#rawTarget').textContent = `${result.method} ${result.url}`;
      $('#rawHeaders').textContent = result.headers.map(([name,value])=>`${name}: ${value}`).join('\n');
      $('#rawBody').textContent = CTFBody.format(result.body,result.contentType);
      $('#rawBody').hidden = result.html;
      $('#rawNotice').textContent = [result.html ? t('Không hiển thị response HTML. Chỉ hỗ trợ nội dung không phải HTML.') : '', result.skipped.length ? t('Header do trình duyệt kiểm soát, không gửi nguyên bản: {headers}', {headers:result.skipped.join(', ')}) : '', result.truncated ? t('Chỉ hiển thị 2 MiB đầu của response.') : ''].filter(Boolean).join(' ');
      $('#rawError').textContent = ''; $('#rawResult').hidden = false;
      $('#rawResult').scrollIntoView({ block:'nearest' });
    } catch (error) { $('#rawError').textContent = active?.signal.aborted ? t('Đã dừng.') : error.message; }
    finally { active = undefined; $('#send').disabled = false; $('#stopRaw').hidden = true; }
  });
})();
