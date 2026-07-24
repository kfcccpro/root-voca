const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

export default async (request) => {
  if (request.method !== 'POST') return json({ ok: false, reason: 'Method not allowed' }, 405);

  const apiKey = Netlify.env.get('RESEND_API_KEY');
  const from = Netlify.env.get('REPORT_FROM_EMAIL');
  if (!apiKey || !from) {
    return json({ ok: false, queued: false, reason: 'Missing RESEND_API_KEY or REPORT_FROM_EMAIL' }, 503);
  }

  let report;
  try {
    report = await request.json();
  } catch {
    return json({ ok: false, reason: 'Invalid JSON' }, 400);
  }

  if (!report?.email || !report?.day || !report?.summary) {
    return json({ ok: false, reason: 'email, day and summary are required' }, 400);
  }

  const summary = report.summary;
  const accuracyLabel = summary.accuracy === null || summary.accuracy === undefined ? '미측정' : `${summary.accuracy}%`;
  const wrongWords = Array.isArray(summary.wrong_words) ? summary.wrong_words : [];
  const wrongHtml = wrongWords.length
    ? `<p><strong>오답 단어</strong></p><p>${wrongWords.map(escapeHtml).join(', ')}</p>`
    : '<p><strong>오답 단어</strong>: 없음</p>';

  const html = `
    <div style="font-family:Arial,'Noto Sans KR',sans-serif;color:#172235;line-height:1.6;max-width:680px;margin:auto">
      <h2 style="margin-bottom:6px">VOCA ROOT DAY ${String(report.day).padStart(2, '0')} 완료</h2>
      <p style="color:#667287;margin-top:0">시작: ${escapeHtml(report.startedAt || '')}<br>완료: ${escapeHtml(report.completedAt || '')}${report.forced ? ' · 관리자 강제 완료' : ''}</p>
      <table style="width:100%;border-collapse:collapse;margin:20px 0">
        <tbody>
          <tr><th style="text-align:left;padding:10px;border-bottom:1px solid #d9e0ec">ROOT</th><td style="padding:10px;border-bottom:1px solid #d9e0ec">${escapeHtml(summary.roots)}</td></tr>
          <tr><th style="text-align:left;padding:10px;border-bottom:1px solid #d9e0ec">단어</th><td style="padding:10px;border-bottom:1px solid #d9e0ec">${escapeHtml(summary.words)}</td></tr>
          <tr><th style="text-align:left;padding:10px;border-bottom:1px solid #d9e0ec">실제 학습시간</th><td style="padding:10px;border-bottom:1px solid #d9e0ec">${escapeHtml(summary.elapsed_minutes)}분</td></tr>
          <tr><th style="text-align:left;padding:10px;border-bottom:1px solid #d9e0ec">정답률</th><td style="padding:10px;border-bottom:1px solid #d9e0ec">${escapeHtml(accuracyLabel)}</td></tr>
          <tr><th style="text-align:left;padding:10px;border-bottom:1px solid #d9e0ec">오답</th><td style="padding:10px;border-bottom:1px solid #d9e0ec">${escapeHtml(summary.wrong)}개</td></tr>
          <tr><th style="text-align:left;padding:10px;border-bottom:1px solid #d9e0ec">철자 회상</th><td style="padding:10px;border-bottom:1px solid #d9e0ec">${escapeHtml(summary.typed)}회</td></tr>
          <tr><th style="text-align:left;padding:10px;border-bottom:1px solid #d9e0ec">기존 DAY 범위</th><td style="padding:10px;border-bottom:1px solid #d9e0ec">${escapeHtml(summary.source_day_range)}</td></tr>
        </tbody>
      </table>
      ${wrongHtml}
      <p style="font-size:12px;color:#667287">보고서 ID: ${escapeHtml(report.reportId || '')}</p>
    </div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(report.reportId ? { 'Idempotency-Key': String(report.reportId).slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from,
      to: [report.email],
      subject: `VOCA ROOT DAY ${String(report.day).padStart(2, '0')} 완료`,
      html,
    }),
  });

  const bodyText = await response.text();
  let providerBody = bodyText;
  try { providerBody = JSON.parse(bodyText); } catch { /* preserve text */ }
  return json({ ok: response.ok, provider: providerBody }, response.status);
};
