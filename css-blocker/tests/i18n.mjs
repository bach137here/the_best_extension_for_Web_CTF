import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const file = new URL('../i18n.js', import.meta.url);
assert.ok(existsSync(file), 'The shared translation module exists');
const context = vm.createContext({});
vm.runInContext(readFileSync(file, 'utf8'), context);
const i18n = context.CTFI18N;
assert.equal(i18n.language, 'vi');
assert.equal(i18n.t('Đã lưu lựa chọn.'), 'Đã lưu lựa chọn.');
assert.equal(i18n.t('Không đọc được requests: {error}', { error: '<offline>' }), 'Không đọc được requests: <offline>');
i18n.apply(); // Safe in a service worker without a document.
i18n.setLanguage('en');
assert.equal(i18n.language, 'en');
assert.equal(i18n.t('Đã lưu lựa chọn.'), 'Preferences saved.');
assert.equal(i18n.t('Không đọc được requests: {error}', { error: '<offline>' }), 'Could not read requests: <offline>');
assert.equal(i18n.t('{count} đang hiện · {total} lượt đã ghi trong các nhóm này', { count: 0, total: 12 }), '0 shown · 12 requests recorded in these groups');
assert.equal(i18n.t('Unknown {name} / {missing}', { name: '$&' }), 'Unknown $& / {missing}');
assert.equal(i18n.t('toString'), 'toString');
assert.equal(i18n.t('Tắt cho endpoint này'), 'Disable for this endpoint');

// Minimal DOM surface: annotation selection and attributes, without a DOM dependency.
const element = (text, attributes = {}) => ({
  textContent: text,
  attributes: { ...attributes },
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
  getAttribute(name) { return this.attributes[name] ?? null; },
  setAttribute(name, value) { this.attributes[name] = value; },
  querySelectorAll() { return []; }
});
const label = element('Ngôn ngữ', { 'data-i18n': '' });
const input = element('', { 'data-i18n-placeholder': '', placeholder: 'Tìm đường dẫn… /admin', 'data-i18n-title': 'Tải lại', 'data-i18n-label': 'URL nguyên chuỗi' });
const untouched = element('Ngôn ngữ');
const root = { querySelectorAll: () => [label, input, untouched] };
i18n.apply(root);
assert.equal(label.textContent, 'Language');
assert.equal(label.getAttribute('data-i18n'), 'Ngôn ngữ');
assert.equal(input.getAttribute('placeholder'), 'Search path… /admin');
assert.equal(input.getAttribute('title'), 'Reload');
assert.equal(input.getAttribute('aria-label'), 'Raw URL');
assert.equal(untouched.textContent, 'Ngôn ngữ');
i18n.setLanguage('vi');
i18n.apply(root);
assert.equal(label.textContent, 'Ngôn ngữ');
assert.equal(input.getAttribute('placeholder'), 'Tìm đường dẫn… /admin');
i18n.setLanguage('en');
i18n.apply(label); // Include an annotated root itself.
assert.equal(label.textContent, 'Language');
i18n.setLanguage('invalid');
assert.equal(i18n.language, 'vi');
assert.equal(i18n.t('Đã lưu lựa chọn.'), 'Đã lưu lựa chọn.');
console.log('i18n tests passed');
