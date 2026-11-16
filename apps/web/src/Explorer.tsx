import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownUp, ChevronLeft, ChevronRight, Radio, Timer, ExternalLink } from 'lucide-react';
import type { Analytics, RequestEvent } from '../../../packages/shared/src/index.js';
import { api, base, time, format, navigate } from './api';
import {
  Panel,
  PageTitle,
  SearchBox,
  Badge,
  Button,
  Drawer,
  Empty,
  ErrorBox,
  Loading,
  CopyButton,
} from './ui';
export function Explorer({ data, range }: { data: Analytics; range: string }) {
  const params = new URLSearchParams(location.hash.split('?')[1]);
  const [search, setSearch] = useState(params.get('search') || '');
  const [errors, setErrors] = useState(params.get('errors') || 'all');
  const [type, setType] = useState('all');
  const [field, setField] = useState(params.get('field') || '');
  const [minDuration, setMinDuration] = useState('');
  const [fingerprint, setFingerprint] = useState(params.get('fingerprint') || '');
  const [sort, setSort] = useState('time');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RequestEvent | null>(null);
  const capture = params.get('capture');
  const query = new URLSearchParams({ search, page: String(page), range, sort });
  if (errors !== 'all') query.set('errors', errors);
  if (type !== 'all') query.set('type', type);
  if (field) query.set('field', field);
  if (capture) query.set('capture', capture);
  if (fingerprint) query.set('fingerprint', fingerprint);
  if (minDuration) query.set('minDuration', minDuration);
  const result = useQuery({
    queryKey: ['requests', data.project.id, query.toString()],
    queryFn: () =>
      api<{ items: RequestEvent[]; total: number; page: number; limit: number }>(
        base(data.project.id) + '/requests?' + query,
      ),
  });
  const change = (fn: () => void) => {
    fn();
    setPage(1);
  };
  return (
    <>
      <PageTitle
        eyebrow="TELEMETRY / LIVE REQUESTS"
        title="Каждый запрос под контролем"
        description="Исследуйте операции, ошибки и выбранные поля. История сохраняется в PostgreSQL."
        actions={
          <Badge tone="green">
            <Radio size={12} /> Live stream
          </Badge>
        }
      />
      <Panel>
        <div className="filter-bar">
          <SearchBox
            value={search}
            onChange={(v) => change(() => setSearch(v))}
            placeholder="Найти операцию или поле…"
          />
          <select
            aria-label="Фильтр ошибок"
            value={errors}
            onChange={(e) => change(() => setErrors(e.target.value))}
          >
            <option value="all">Все запросы</option>
            <option value="true">Только ошибки</option>
            <option value="false">Без ошибок</option>
          </select>
          <select
            aria-label="Тип операции"
            value={type}
            onChange={(e) => change(() => setType(e.target.value))}
          >
            <option value="all">Все операции</option>
            <option value="query">Query</option>
            <option value="mutation">Mutation</option>
          </select>
          <input
            aria-label="Минимальная длительность"
            className="small-input"
            placeholder="Min ms"
            type="number"
            min="0"
            value={minDuration}
            onChange={(e) => change(() => setMinDuration(e.target.value))}
          />
          <Button small onClick={() => change(() => setSort(sort === 'time' ? 'duration' : 'time'))}>
            <ArrowDownUp size={14} />
            {sort === 'time' ? 'По времени' : 'По latency'}
          </Button>
        </div>
        {fingerprint && (
          <div className="active-filter">
            Операция: <code>{fingerprint.slice(0, 12)}</code>
            <button onClick={() => change(() => setFingerprint(''))}>× Снять фильтр структуры</button>
          </div>
        )}
        {field && (
          <div className="active-filter">
            Поле: <code>{field}</code>
            <button onClick={() => change(() => setField(''))}>× Снять фильтр</button>
          </div>
        )}
        {result.isPending ? (
          <Loading />
        ) : result.error ? (
          <ErrorBox message={result.error.message} />
        ) : !result.data?.items.length ? (
          <Empty
            title="Запросы не найдены"
            description="Измените фильтры или отправьте настоящий запрос через Playground."
            action={<Button onClick={() => navigate('playground')}>Открыть Playground</Button>}
          />
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Операция</th>
                    <th>Время</th>
                    <th>Тип</th>
                    <th>Источник</th>
                    <th>Поля</th>
                    <th>Latency</th>
                    <th>Результат</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.items.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => setSelected(r)}>
                      <td>
                        <div className="operation-cell">
                          <span
                            className={`field-dot ${r.errors.length || r.status >= 400 ? 'error' : 'observed'}`}
                          />
                          <strong>{r.operationName}</strong>
                        </div>
                        <small className="mono muted">{r.id.slice(0, 8)}</small>
                      </td>
                      <td className="mono muted">{time(r.createdAt)}</td>
                      <td>
                        <Badge tone={r.operationType === 'mutation' ? 'amber' : 'violet'}>
                          {r.operationType}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          tone={r.origin === 'test' ? 'green' : r.origin === 'demo' ? 'blue' : 'neutral'}
                        >
                          {r.origin === 'demo' ? 'Demo Traffic' : r.origin}
                        </Badge>
                      </td>
                      <td>{r.fields.length}</td>
                      <td className={r.duration > 500 ? 'color-amber' : 'mono'}>{format(r.duration)} ms</td>
                      <td>
                        <Badge tone={r.errors.length || r.status >= 400 ? 'red' : 'green'}>
                          {r.errors.length && r.status < 400 ? 'GraphQL error' : `HTTP ${r.status}`}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                {result.data.total} событий · страница {page} из{' '}
                {Math.max(1, Math.ceil(result.data.total / 25))}
              </span>
              <div>
                <Button small disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={15} />
                </Button>
                <Button small disabled={page * 25 >= result.data.total} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={15} />
                </Button>
              </div>
            </div>
          </>
        )}
      </Panel>
      {selected && (
        <Drawer title={selected.operationName} onClose={() => setSelected(null)}>
          <div className="flex-between">
            <Badge tone="violet">{selected.operationType}</Badge>
            <span className="muted mono">{selected.id.slice(0, 8)}</span>
          </div>
          <div className="detail-grid">
            <div>
              <Timer size={14} /> Длительность<strong>{selected.duration} ms</strong>
            </div>
            <div>
              HTTP status<strong>{selected.status}</strong>
            </div>
            <div>
              Поля<strong>{selected.fields.length}</strong>
            </div>
            <div>
              Источник<strong>{selected.origin}</strong>
            </div>
          </div>
          <div className="flex-between">
            <h3>Безопасная структура операции</h3>
            <CopyButton value={selected.query} />
          </div>
          <p className="muted">
            Литеральные значения скрыты. Variables, headers и response body не сохраняются.
          </p>
          <pre className="code-block">{selected.query}</pre>
          {selected.analysisError && <ErrorBox message={selected.analysisError} />}{' '}
          {!!selected.errors.length && (
            <>
              <h3>Зафиксированные ошибки</h3>
              {selected.errors.map((e, i) => (
                <div key={i} className="error-detail">
                  <Badge tone="red">{e.code || 'GRAPHQL_ERROR'}</Badge>
                  <p>{e.message}</p>
                  {e.path && <code>path: {e.path.join('.')}</code>}
                </div>
              ))}
              <p className="muted">Сообщения upstream скрыты в хранилище для защиты чувствительных данных.</p>
            </>
          )}
          <h3>Выбранные координаты схемы</h3>
          <div className="field-chips">
            {selected.fields.map((f) => (
              <button
                key={f}
                onClick={() => {
                  setSelected(null);
                  change(() => setField(f));
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <Button onClick={() => navigate('graph', { request: selected.id })}>
            Подсветить в Graph Universe <ExternalLink size={14} />
          </Button>
        </Drawer>
      )}
    </>
  );
}
