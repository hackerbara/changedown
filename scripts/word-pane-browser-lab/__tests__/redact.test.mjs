import test from 'node:test';
import assert from 'node:assert/strict';
import { hashValue, redactString, sanitizeUrl, sanitizeJson } from '../redact.mjs';

test('sanitizeUrl strips token-like query values', () => {
  assert.equal(
    sanitizeUrl('https://relay.test/pane?token=secret123&room=public-1'),
    'https://relay.test/pane?token=%5Bredacted%5D&room=public-1',
  );
});

test('redactString removes bearer tokens and local user paths', () => {
  const redacted = redactString('Authorization: Bearer abc.def /Users/MAC/private?token=secret cdr2.public-1.secret');
  assert.match(redacted, /Bearer \[redacted\]/);
  assert.match(redacted, /\/Users\/\[redacted\]/);
  assert.doesNotMatch(redacted, /abc\.def/);
  assert.doesNotMatch(redacted, /secret/);
  assert.match(redacted, /\[redacted-cdr-token\]/);
});

test('sanitizeJson redacts sensitive keys recursively', () => {
  assert.deepEqual(sanitizeJson({ token: 'abc', hasToken: true, tokenHash: 'abc123', nested: { Authorization: 'Bearer xyz', ok: true } }), {
    token: '[redacted]',
    hasToken: true,
    tokenHash: 'abc123',
    nested: { Authorization: '[redacted]', ok: true },
  });
});

test('hashValue returns stable short hash', () => {
  assert.equal(hashValue('secret').length, 16);
  assert.equal(hashValue('secret'), hashValue('secret'));
});
