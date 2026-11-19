(() => {
  const $ = selector => document.querySelector(selector);
  $('#closeRaw').addEventListener('click', () => $('#rawEditor').close());
  $('#rawRequest').addEventListener('input', () => { $('#rawError').textContent = ''; });
  $('#send').addEventListener('click', async () => {
    let key;
    try {
      $('#rawError').textContent = ''; $('#send').disabled = true;
      const raw = $('#rawRequest').value, protocol = $('#protocol').value;
      CTFReplay.parse(raw, protocol);
      key = 'replay:' + crypto.randomUUID();
      await chrome.storage.session.set({ [key]: { raw, protocol } });
      await chrome.tabs.create({ url: chrome.runtime.getURL('response.html') + '#' + key });
    } catch (error) {
      if (key) await chrome.storage.session.remove(key).catch(() => {});
      $('#rawError').textContent = error.message;
    } finally { $('#send').disabled = false; }
  });
})();
