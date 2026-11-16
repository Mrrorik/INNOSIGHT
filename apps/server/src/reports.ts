import type { Analytics } from '../../../packages/shared/src/index.js';
import { METHODOLOGY } from '../../../packages/shared/src/index.js';
export const escapeHTML = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function csv(a: Analytics) {
  const cell = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return [
    'coordinate,type,observed,verified,errors,risk',
    ...a.fields.map((f) =>
      [f.coordinate, f.type, f.observed, f.verified, f.errors, f.risk].map(cell).join(','),
    ),
  ].join('\r\n');
}
export function htmlReport(a: Analytics) {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><title>INNOSIGHT · ${escapeHTML(a.project.name)}</title><style>body{font:15px system-ui;background:#f5f7fb;color:#152238;max-width:1050px;margin:50px auto;padding:20px}header{border-bottom:3px solid #4d64ff;padding-bottom:25px}h1{font-size:42px}h2{margin-top:40px}.metrics{display:flex;gap:35px;flex-wrap:wrap;margin:30px 0}.metrics b{font-size:30px;display:block}table{width:100%;border-collapse:collapse;background:white}td,th{text-align:left;padding:10px;border-bottom:1px solid #dce3ed}p{line-height:1.7}.muted{color:#64748b}@media print{button{display:none}body{margin:0;background:white}}</style><header><small>INNOSIGHT / GRAPHQL INTELLIGENCE REPORT</small><h1>${escapeHTML(a.project.name)}</h1><p>Сеть глазами Бога. Каждый запрос под контролем.</p><span class="muted">${new Date().toISOString()} · Schema ${escapeHTML(a.schema.id)}</span></header><div class="metrics"><div><b>${a.metrics.selectionCoverage}%</b>Selection coverage</div><div><b>${a.metrics.verifiedCoverage}%</b>Verified test coverage</div><div><b>${a.metrics.requests}</b>Requests (24h)</div><div><b>${a.metrics.errors}</b>Errors (24h)</div></div><button onclick="window.print()">Печать / сохранить PDF</button><h2>Приоритеты проверки</h2><table><tr><th>Поле</th><th>Риск</th><th>Наблюдение</th><th>Рекомендация</th></tr>${a.risks
    .slice(0, 20)
    .map(
      (r) =>
        `<tr><td>${escapeHTML(r.coordinate)}</td><td>${r.score} / 100</td><td>${escapeHTML(r.reason)}</td><td>${escapeHTML(r.recommendation)}</td></tr>`,
    )
    .join(
      '',
    )}</table><h2>Операции с ошибками</h2><table><tr><th>Операция</th><th>Requests</th><th>Errors</th><th>Среднее время</th></tr>${a.operations
    .filter((o) => o.errors || o.latency > 500)
    .map(
      (o) =>
        `<tr><td>${escapeHTML(o.name)}</td><td>${o.requests}</td><td>${o.errors}</td><td>${o.latency} ms</td></tr>`,
    )
    .join(
      '',
    )}</table><h2>Change impact</h2>${a.changes.length ? a.changes.map((c) => `<p><b>${escapeHTML(c.severity)}</b> ${escapeHTML(c.description)} · ${c.observedRequests} observed requests · ${c.testIds.length} tests</p>`).join('') : '<p>Сравнение версий ещё не выполнено.</p>'}<h2>Ненаблюдавшиеся поля</h2><p>${
    a.fields
      .filter((f) => !f.observed)
      .map((f) => escapeHTML(f.coordinate))
      .join(' · ') || 'Все поля наблюдались.'
  }</p><h2>Методология и ограничения</h2><p>${escapeHTML(METHODOLOGY)}</p><p>Риск — детерминированная эвристика, не доказательство уязвимости. История наблюдений ограничена собранным трафиком. Отсутствие наблюдений не доказывает отсутствие клиентов.</p></html>`;
}
