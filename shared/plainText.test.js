import assert from 'node:assert/strict';
import test from 'node:test';
import { toPlainText } from './plainText.js';

test('toPlainText removes emoji and decorative symbols but keeps the answer', () => {
  assert.equal(toPlainText('**Hello!** \u{1F600} \u{1F60A}\n- plain answer \u2192 yes \u2728'), 'Hello!\nplain answer yes');
});

test('toPlainText preserves Bangla script and sentence marks', () => {
  assert.equal(toPlainText('\u09ac\u09be\u0982\u09b2\u09be \u0989\u09a4\u09cd\u09a4\u09b0\u0964 \u0986\u09b0\u09ac\u09bf\u0964'), '\u09ac\u09be\u0982\u09b2\u09be \u0989\u09a4\u09cd\u09a4\u09b0\u0964 \u0986\u09b0\u09ac\u09bf\u0964');
});

test('toPlainText removes markdown links and list markers without losing their words', () => {
  assert.equal(toPlainText('1. Read [this guide](https://example.com)\n> Then remember Allah.'), 'Read this guide\nThen remember Allah.');
});

test('toPlainText safely handles non-string input', () => {
  assert.equal(toPlainText(null), '');
  assert.equal(toPlainText(42), '42');
});
