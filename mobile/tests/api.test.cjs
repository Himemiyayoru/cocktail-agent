const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { apiRequest } = require('../src/lib/api.ts');
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });
test('returns successful JSON and forwards the request body', async () => {
  global.fetch = async (_url, options) => { assert.equal(options.body, 'payload'); return Response.json({ status: 'success', data: [1] }); };
  assert.deepEqual(await apiRequest('/example', { method: 'POST', body: 'payload' }), { status: 'success', data: [1] });
});
test('HTTP errors and logical errors cannot appear as successful results', async () => {
  global.fetch = async () => Response.json({ detail: 'Missing' }, { status: 404 });
  await assert.rejects(apiRequest('/missing'), /no longer available/);
  global.fetch = async () => Response.json({ status: 'error', detail: 'Try again' });
  await assert.rejects(apiRequest('/error'), /Try again/);
});
test('malformed responses and network failure have recoverable messages', async () => {
  global.fetch = async () => new Response('not json');
  await assert.rejects(apiRequest('/bad'), /unreadable response/);
  global.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(apiRequest('/offline'), /Check your connection/);
});
function hangingFetch(_url, options) {
  return new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (options.signal.aborted) abort();
    else options.signal.addEventListener('abort', abort, { once: true });
  });
}
test('timeout aborts the underlying request', async () => {
  global.fetch = hangingFetch;
  await assert.rejects(apiRequest('/slow', {}, 5), /taking too long/);
});
test('caller cancellation remains distinguishable from timeout', async () => {
  global.fetch = hangingFetch;
  const controller = new AbortController();
  const pending = apiRequest('/cancel', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});
test('rate limiting has an actionable message', async () => {
  global.fetch = async () => Response.json({}, { status: 429 });
  await assert.rejects(apiRequest('/limited'), /try again later/);
});
