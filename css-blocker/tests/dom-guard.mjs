import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
let source = '';
try { source = await readFile(new URL('../dom-guard.js', import.meta.url), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const context = vm.createContext({}); vm.runInContext(source, context);
assert.ok(context.CTFDOM, 'DOM ownership guard must exist');
const guard = context.CTFDOM.isExtensionUI;
const node = (localName, attributes = {}, parentElement = null) => ({ localName, parentElement, getAttribute: name => attributes[name] ?? null, hasAttribute: name => name in attributes });
assert.equal(guard(node('input', { type: 'hidden', name: 'flag', id: 'extension-token' })), false, 'Legitimate page field names must not be blacklisted');
assert.equal(guard(node('input', { 'data-bitwarden-watching': '1', 'data-lastpass-ignore': 'true' })), false, 'Password manager annotations on page fields do not make them extension UI');
for (const root of [node('plasmo-csui'), node('wxt-root'), node('com-bitwarden-fido2-menu'), node('div', { 'data-extension-id': 'abc' }), node('div', { 'data-lastpass-root': '' }), node('iframe', { src: 'chrome-extension://abc/ui.html' }), node('grammarly-desktop-integration')]) {
  assert.equal(guard(root), true);
  assert.equal(guard(node('input', { type: 'hidden' }, node('div', {}, root))), true, 'Guard descendants, not only root');
}
for (const attributes of [{ id: 'code-formatter-root' }, { class: 'CodeMirror' }, { class: 'cm-editor' }, { class: 'ace_editor' }, { class: 'monaco-editor' }]) assert.equal(guard(node('textarea', {}, node('div', attributes))), true, 'Do not reveal technical editor textareas');
assert.equal(guard(node('div', { class: 'code-formatter-toolbar__dropdown-menu' }, node('div', { class: 'code-formatter-toolbar' }))), true, 'Code Formatter dropdown remains under its own control');
assert.equal(guard(node('pre', { hidden: '', style: 'display: none' }, node('body', { class: 'code-formatter-is-loaded' }))), true, 'Code Formatter original raw PRE must stay hidden');
assert.equal(guard(node('div', { id: 'code-formatter-renderer' })), true);
const shadowHost = node('div'); shadowHost.shadowRoot = {};
assert.equal(guard(shadowHost), true, 'Leave shadow UI hosts alone');
const inner = node('input'); inner.getRootNode = () => ({ host: shadowHost });
assert.equal(guard(inner), true, 'Follow shadow root host when checking event targets');
console.log('PASS: extension roots, descendants, extension URLs, shadow hosts, legitimate hidden fields and password-manager annotations.');
