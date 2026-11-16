import { useState } from 'react';
import { CheckCheck, Download, Eye, ScanLine, ExternalLink, AlertTriangle } from 'lucide-react';
import type { Analytics, FieldStat } from '../../../packages/shared/src/index.js';
import { format, navigate } from './api';
import { Panel, PageTitle, SearchBox, Badge, FieldDot, Button, Drawer, Empty } from './ui';
export function Coverage({ data }: { data: Analytics }) {
  const [search, setSearch] = useState(new URLSearchParams(location.hash.split('?')[1]).get('search') || ''),
    [filter, setFilter] = useState('all'),
    [sort, setSort] = useState('name'),
    [selected, setSelected] = useState<FieldStat | null>(null);
  const rows = data.fields
    .filter(
      (f) =>
        f.coordinate.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'unobserved'
            ? !f.observed
            : filter === 'unverified'
              ? !f.verified
              : filter === 'verified'
                ? f.verified
                : !!f.deprecated)),
    )
    .sort((a, b) =>
      sort === 'risk'
        ? b.risk - a.risk
        : sort === 'usage'
          ? b.observed - a.observed
          : a.coordinate.localeCompare(b.coordinate),
    );
  return (
    <>
      <PageTitle
        eyebrow="SCHEMA INTELLIGENCE / COVERAGE"
        title="Покрытие схемы"
        description="Каждое output-поле имеет свою историю наблюдений и отдельное тестовое подтверждение."
        actions={
          <a className="button" href={`/api/projects/${data.project.id}/report/csv`} download>
            <Download size={15} /> Export CSV
          </a>
        }
      />
      <div className="metric-strip">
        <div>
          <ScanLine size={20} />
          <strong>{format(data.metrics.selectionCoverage)}%</strong>
          <span>Selection coverage</span>
        </div>
        <div>
          <CheckCheck size={20} />
          <strong>{format(data.metrics.verifiedCoverage)}%</strong>
          <span>Verified coverage</span>
        </div>
        <div>
          <Eye size={20} />
          <strong>{data.metrics.unobserved}</strong>
          <span>Ненаблюдавшихся полей</span>
        </div>
      </div>
      <Panel>
        <div className="filter-bar">
          <SearchBox value={search} onChange={setSearch} placeholder="Найти тип или координату…" />
          <select aria-label="Статус покрытия" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Все поля</option>
            <option value="unobserved">Не наблюдались</option>
            <option value="unverified">Без тестового подтверждения</option>
            <option value="verified">Verified</option>
            <option value="deprecated">Deprecated</option>
          </select>
          <select aria-label="Сортировка покрытия" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">По имени</option>
            <option value="usage">По частоте</option>
            <option value="risk">По риску</option>
          </select>
          <Badge>{rows.length} полей</Badge>
        </div>
        {!rows.length ? (
          <Empty title="Таких полей нет" description="Измените поиск или статус покрытия." />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Координата поля</th>
                  <th>Тип</th>
                  <th>Наблюдения</th>
                  <th>Тесты</th>
                  <th>Ошибки</th>
                  <th>Риск</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.coordinate} className="clickable" onClick={() => setSelected(f)}>
                    <td>
                      <div className="operation-cell">
                        <FieldDot field={f} />
                        <code>{f.coordinate}</code>
                        {f.deprecated && (
                          <span title={f.deprecated}>
                            <AlertTriangle size={13} className="color-amber" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="mono muted">{f.type}</td>
                    <td>{f.observed}</td>
                    <td>{f.testIds.length}</td>
                    <td className={f.errors ? 'color-red' : 'muted'}>{f.errors || '—'}</td>
                    <td>
                      <div className="risk-cell">
                        <div>
                          <i
                            style={{
                              width: f.risk + '%',
                              background: f.risk >= 60 ? '#f4778d' : f.risk >= 30 ? '#f0bc77' : '#727fa1',
                            }}
                          />
                        </div>
                        {f.risk}
                      </div>
                    </td>
                    <td>
                      <Badge tone={f.errors ? 'red' : f.verified ? 'green' : f.observed ? 'blue' : 'neutral'}>
                        {f.errors
                          ? 'Errors'
                          : f.verified
                            ? 'Verified'
                            : f.observed
                              ? 'Observed'
                              : 'Unobserved'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="footnote">
          Знаменатель: {data.metrics.total} object/interface output-полей текущей схемы. Input-поля и
          introspection исключены. Покрытие накопительное, runtime health зависит от периода.
        </p>
      </Panel>
      {selected && (
        <Drawer title={selected.coordinate} onClose={() => setSelected(null)}>
          <Badge>{selected.type}</Badge>
          <div className="detail-grid">
            <div>
              Observed<strong>{selected.observed}</strong>
            </div>
            <div>
              Verified<strong>{selected.verified ? 'Да' : 'Нет'}</strong>
            </div>
            <div>
              Errors<strong>{selected.errors}</strong>
            </div>
            <div>
              Risk score<strong>{selected.risk}</strong>
            </div>
          </div>
          <p className="explanation">
            {selected.reasons.join('. ') || 'Успешные assertions подтвердили данные на пути этого поля.'}
          </p>
          {selected.deprecated && <div className="error-box">Deprecated: {selected.deprecated}</div>}
          <h3>Связанные тесты</h3>
          <div className="field-chips">
            {selected.testIds.length ? (
              selected.testIds.map((t) => <span key={t}>{t}</span>)
            ) : (
              <p className="muted">Тестовое подтверждение отсутствует.</p>
            )}
          </div>
          <h3>Аргументы</h3>
          {selected.args.length ? (
            selected.args.map((a) => (
              <p key={a.name}>
                <code>
                  {a.name}: {a.type}
                </code>{' '}
                {a.required && <Badge tone="amber">fixture required</Badge>}
              </p>
            ))
          ) : (
            <p className="muted">Аргументы не требуются.</p>
          )}
          <Button onClick={() => navigate('requests', { field: selected.coordinate })}>
            Связанные события <ExternalLink size={14} />
          </Button>
          <Button variant="ghost" onClick={() => navigate('tests')}>
            Перейти к тестированию
          </Button>
        </Drawer>
      )}
    </>
  );
}
export function Risks({ data }: { data: Analytics }) {
  const [severity, setSeverity] = useState('all');
  const rows = data.risks.filter((r) => severity === 'all' || r.severity === severity);
  return (
    <>
      <PageTitle
        eyebrow="QUALITY INTELLIGENCE / RISK ENGINE"
        title="Что проверить в первую очередь"
        description="Объяснимые рекомендации из фактического трафика. Детерминированная эвристика, а не AI-прогноз."
      />
      <div className="risk-overview">
        <div className="risk-summary high">
          <AlertTriangle />
          <strong>{data.risks.filter((r) => r.severity === 'high').length}</strong>
          <span>Высокий приоритет</span>
        </div>
        <div className="risk-summary medium">
          <ScanLine />
          <strong>{data.risks.filter((r) => r.severity === 'medium').length}</strong>
          <span>Средний приоритет</span>
        </div>
        <div className="risk-summary low">
          <Eye />
          <strong>{data.metrics.unobserved}</strong>
          <span>Ненаблюдавшихся полей</span>
        </div>
      </div>
      <Panel
        title="Приоритеты проверки"
        action={
          <select aria-label="Уровень риска" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="all">Все уровни</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        }
      >
        <div className="finding-list">
          {rows.slice(0, 40).map((r) => (
            <article className={`finding ${r.severity}`} key={r.id}>
              <div className="finding-score">
                {r.score}
                <small>/100</small>
              </div>
              <div>
                <div className="finding-title">
                  <code>{r.coordinate}</code>
                  <Badge tone={r.severity === 'high' ? 'red' : r.severity === 'medium' ? 'amber' : 'neutral'}>
                    {r.severity}
                  </Badge>
                </div>
                <p>{r.reason}</p>
                <span className="finding-recommendation">{r.recommendation}</span>
                <div className="finding-evidence">
                  {r.observations} наблюдений · {r.errors} ошибочных операций · Возможное влияние: поведение
                  API без достаточного тестового подтверждения.
                </div>
              </div>
              <Button small onClick={() => navigate('requests', { field: r.coordinate })}>
                События <ExternalLink size={13} />
              </Button>
            </article>
          ))}
          {!rows.length && (
            <Empty
              title="Находок этого уровня нет"
              description="Новые запросы и тесты автоматически пересчитывают рекомендации."
            />
          )}
        </div>
        <p className="footnote">
          Score: непроверенное поле +15; используемое без тестов +20…45 (log частоты); ошибки +20…40;
          используемое deprecated-поле +25. Максимум 100. Ошибка операции относится к выбранным полям как
          корреляция, а не доказанный дефект каждого resolver.
        </p>
      </Panel>
    </>
  );
}
