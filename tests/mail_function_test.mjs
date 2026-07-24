import assert from 'node:assert/strict';
import handler from '../netlify/functions/send-day-report.mjs';

const originalFetch = globalThis.fetch;
const originalNetlify = globalThis.Netlify;

try {
  globalThis.Netlify = { env: { get: () => undefined } };
  let response = await handler(new Request('http://localhost/.netlify/functions/send-day-report', { method: 'GET' }));
  assert.equal(response.status, 405);

  response = await handler(new Request('http://localhost/.netlify/functions/send-day-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  }));
  assert.equal(response.status, 503);

  const env = {
    RESEND_API_KEY: 'test-key',
    REPORT_FROM_EMAIL: 'report@example.com',
  };
  globalThis.Netlify = { env: { get: (key) => env[key] } };

  let captured = null;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ id: 'email_123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const payload = {
    email: 'sk01197375068@gmail.com',
    day: 18,
    reportId: 'report-final-18',
    startedAt: '2026-07-24T10:00:00.000Z',
    completedAt: '2026-07-24T10:55:00.000Z',
    forced: true,
    summary: {
      roots: 19,
      words: 81,
      elapsed_minutes: 55,
      accuracy: null,
      wrong: 1,
      typed: 3,
      source_day_range: '57-60',
      wrong_words: ['<script>alert(1)</script>'],
    },
  };

  response = await handler(new Request('http://localhost/.netlify/functions/send-day-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true);
  assert.equal(captured.url, 'https://api.resend.com/emails');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  assert.equal(captured.options.headers['Idempotency-Key'], 'report-final-18');

  const providerPayload = JSON.parse(captured.options.body);
  assert.deepEqual(providerPayload.to, ['sk01197375068@gmail.com']);
  assert.match(providerPayload.subject, /DAY 18 완료/);
  assert.match(providerPayload.html, /미측정/);
  assert.match(providerPayload.html, /관리자 강제 완료/);
  assert.doesNotMatch(providerPayload.html, /<script>/);
  assert.match(providerPayload.html, /&lt;script&gt;/);

  console.log('MAIL_FUNCTION_OK');
  console.log(JSON.stringify({
    destination: providerPayload.to[0],
    forced_accuracy_label: '미측정',
    idempotency_key: captured.options.headers['Idempotency-Key'],
    html_escaping: true,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
  globalThis.Netlify = originalNetlify;
}
