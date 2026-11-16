import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { Play, Code2, ArrowRight, CheckCircle2, Braces, History, RotateCcw } from 'lucide-react';
import type { Analytics, RequestEvent } from '../../../packages/shared/src/index.js';
import { api, base, queryClient, format, navigate } from './api';
import { Panel, PageTitle, Button, Badge, ErrorBox, CopyButton } from './ui';
// Stream tokenizer only supplies editor colors. Backend parsing always uses graphql-js.
const graphqlLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match(/^#.*/)) return 'comment';
    if (stream.match(/^"(?:[^"\\]|\\.)*"/)) return 'string';
    if (stream.match(/^\$[\w]+/)) return 'variableName';
    if (stream.match(/^(query|mutation|subscription|fragment|on)\b/)) return 'keyword';
    if (stream.match(/^(true|false|null)\b/)) return 'bool';
    if (stream.match(/^[A-Za-z_][\w]*/)) return 'propertyName';
    if (stream.match(/^-?\d+(\.\d+)?/)) return 'number';
    stream.next();
    return 'punctuation';
  },
});
export const examples = [
  {
    name: 'Каталог товаров',
    query:
      'query Catalog {\n  products {\n    id\n    name\n    price\n    currency\n    category { id name }\n  }\n}',
  },
  {
    name: 'Открыть слепые зоны',
    query:
      'query DiscoverSuppliers {\n  suppliers {\n    id\n    name\n    country\n    leadTimeDays\n    rating\n    products { id sku inventory { warehouse reserved } }\n  }\n}',
  },
  {
    name: 'Пользователь + variables',
    query:
      'query UserProfile($id: ID!) {\n  user(id: $id) {\n    id name email\n    notifications { id title message read }\n    reviews { rating comment }\n  }\n}',
    variables: '{ "id": "u1" }',
    operationName: 'UserProfile',
  },
  {
    name: 'Fragments и aliases',
    query:
      'query FragmentExample($showPrice: Boolean! = true) {\n  catalog: products {\n    ...ProductInfo\n    price @include(if: $showPrice)\n  }\n}\nfragment ProductInfo on Product {\n  id name\n  supplier { id name }\n}',
  },
  {
    name: 'Контролируемая ошибка',
    query: 'query PaymentIncident {\n  unstablePayment { id status amount }\n}',
  },
  {
    name: 'Медленный resolver',
    query:
      'query SlowAnalytics {\n  slowAnalytics(delayMs: 800) {\n    revenue orderCount averageOrderValue\n  }\n}',
  },
  {
    name: 'Deprecated-клиент',
    query: 'query LegacyClient {\n  users { id legacyName }\n  products { id legacyPrice }\n}',
  },
  {
    name: 'Mutation · добавить отзыв',
    query:
      'mutation AddReview {\n  createReview(input: {\n    productId: "p1", userId: "u1",\n    rating: 5, comment: "Проверка через INNOSIGHT"\n  }) { id rating comment }\n}',
  },
];
export function Playground({
  data,
  notify,
}: {
  data: Analytics;
  notify: (s: string, error?: boolean) => void;
}) {
  const [headersJSON, setHeadersJSON] = useState('{}');
  const [query, setQuery] = useState(examples[0].query),
    [variables, setVariables] = useState('{}'),
    [operationName, setOperationName] = useState(''),
    [response, setResponse] = useState(''),
    [status, setStatus] = useState<number | null>(null),
    [duration, setDuration] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [discovery, setDiscovery] = useState<{
      event: RequestEvent | null;
      delta: number;
      newFields: string[];
    } | null>(null),
    [history, setHistory] = useState<
      { query: string; variables: string; operationName: string; time: string }[]
    >([]);
  const { data: historyData } = useQuery({
    queryKey: ['requests', data.project.id, 'playground-history'],
    queryFn: () => api<{ items: RequestEvent[] }>(base(data.project.id) + '/requests?limit=5'),
  });
  async function execute() {
    setBusy(true);
    setError('');
    const before = data.metrics.selectionCoverage;
    const beforeFields = new Set(data.fields.filter((f) => f.observed).map((f) => f.coordinate));
    const start = performance.now();
    try {
      const parsed = JSON.parse(variables || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        throw new Error('Variables должны быть JSON object.');
      const extraHeaders = JSON.parse(headersJSON || '{}');
      if (
        !extraHeaders ||
        typeof extraHeaders !== 'object' ||
        Array.isArray(extraHeaders) ||
        Object.entries(extraHeaders).some(
          ([name, value]) =>
            !['authorization', 'x-api-key', 'accept-language'].includes(name.toLowerCase()) ||
            typeof value !== 'string',
        )
      )
        throw new Error('Headers: допускаются строковые authorization, x-api-key и accept-language.');
      const res = await fetch(`/proxy/${data.project.id}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...extraHeaders },
        body: JSON.stringify({ query, variables: parsed, ...(operationName ? { operationName } : {}) }),
      });
      const text = await res.text();
      let formatted = text;
      try {
        formatted = JSON.stringify(JSON.parse(text), null, 2);
      } catch {}
      setResponse(formatted);
      setStatus(res.status);
      setDuration(Math.round(performance.now() - start));
      const next = await api<Analytics>(base(data.project.id) + '/analytics');
      const requestId = res.headers.get('x-innosight-request-id');
      const event = next.recent.find((r) => r.id === requestId) || null;
      setDiscovery({
        event,
        delta: Math.round((next.metrics.selectionCoverage - before) * 100) / 100,
        newFields: event?.fields.filter((f) => !beforeFields.has(f)) || [],
      });
      setHistory((h) =>
        [{ query, variables, operationName, time: new Date().toLocaleTimeString('ru-RU') }, ...h].slice(0, 8),
      );
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка выполнения');
      notify('Запрос не выполнен', true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="DEVELOPER TOOLS / PLAYGROUND"
        title="GraphQL Playground"
        description="Выполняйте настоящие GraphQL-операции через INNOSIGHT Proxy и сразу наблюдайте результат."
      />
      <div className="playground-endpoint">
        <span className="http-method">POST</span>
        <code>
          {location.origin}/proxy/{data.project.id}/graphql
        </code>
        <CopyButton value={`${location.origin}/proxy/${data.project.id}/graphql`} />
        <Badge tone="green">Proxy enabled</Badge>
      </div>
      <div className="playground-toolbar">
        <select
          aria-label="Готовые примеры"
          defaultValue=""
          onChange={(e) => {
            const item = examples[Number(e.target.value)];
            if (item) {
              setQuery(item.query);
              setVariables(item.variables || '{}');
              setOperationName(item.operationName || '');
            }
          }}
        >
          <option value="" disabled>
            Готовые примеры запросов
          </option>
          {examples.map((e, i) => (
            <option value={i} key={i}>
              {e.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Operation name"
          placeholder="Operation name (необязательно)"
          value={operationName}
          onChange={(e) => setOperationName(e.target.value)}
        />
        <Button variant="primary" onClick={execute} disabled={busy}>
          <Play size={15} fill="currentColor" />
          {busy ? 'Выполняется…' : 'Execute query'}
        </Button>
      </div>
      {error && <ErrorBox message={error} />}
      <details className="playground-headers">
        <summary>Upstream headers · только в памяти вкладки</summary>
        <p>
          Authorization или x-api-key передаются настроенному upstream. Не записываются в историю операций.
        </p>
        <textarea
          aria-label="Upstream headers JSON"
          value={headersJSON}
          onChange={(e) => setHeadersJSON(e.target.value)}
          rows={3}
          placeholder={'{ "authorization": "Bearer …" }'}
        />
      </details>
      <div className="editor-grid">
        <Panel
          title={
            <>
              <Code2 size={16} /> GraphQL query
            </>
          }
          action={
            <Button
              small
              variant="ghost"
              title="Восстановить пример"
              onClick={() => {
                setQuery(examples[0].query);
                setVariables('{}');
                setOperationName('');
              }}
            >
              <RotateCcw size={14} />
            </Button>
          }
        >
          <div data-testid="query-editor">
            <CodeMirror
              value={query}
              height="390px"
              theme={oneDark}
              extensions={[graphqlLanguage]}
              onChange={setQuery}
              aria-label="GraphQL query"
              basicSetup={{ foldGutter: true, autocompletion: true }}
            />
          </div>
          <div className="variables-header">
            <Braces size={14} /> Variables <small>Значения не сохраняются на сервере</small>
          </div>
          <div data-testid="variables-editor">
            <CodeMirror
              value={variables}
              height="120px"
              theme={oneDark}
              extensions={[json()]}
              onChange={setVariables}
              aria-label="GraphQL variables"
            />
          </div>
        </Panel>
        <Panel
          title="Response"
          action={
            <div className="response-status">
              {status && (
                <>
                  <Badge
                    tone={
                      status < 400 && !response.includes('"errors"') && !discovery?.event?.errors.length
                        ? 'green'
                        : 'red'
                    }
                  >
                    HTTP {status}
                  </Badge>
                  <span>{duration} ms</span>
                </>
              )}
              <CopyButton value={response} />
            </div>
          }
        >
          {status !== null ? (
            <CodeMirror
              value={response}
              height="550px"
              theme={oneDark}
              extensions={[json()]}
              readOnly
              aria-label="GraphQL response"
            />
          ) : (
            <div className="response-empty">
              <div>
                <Braces size={36} />
                <h3>Ответ появится здесь</h3>
                <p>Отправьте запрос. Каждый вызов будет проанализирован и сохранён в истории.</p>
              </div>
            </div>
          )}
        </Panel>
      </div>
      {discovery && (
        <Panel
          className="discovery-panel"
          title={
            <>
              <CheckCircle2 size={18} /> Что обнаружила система
            </>
          }
          action={<Badge tone="violet">REAL ANALYSIS</Badge>}
        >
          <div className="discovery-grid">
            <div>
              <small>Операция</small>
              <strong>{discovery.event?.operationName || 'Не определена'}</strong>
            </div>
            <div>
              <small>Выбрано полей</small>
              <strong>{discovery.event?.fields.length || 0}</strong>
            </div>
            <div>
              <small>Новые поля</small>
              <strong className="color-blue">{discovery.newFields.length}</strong>
            </div>
            <div>
              <small>Изменение coverage</small>
              <strong className="color-green">+{format(discovery.delta)} п.п.</strong>
            </div>
            <div>
              <small>Ошибки</small>
              <strong>{discovery.event?.errors.length || 0}</strong>
            </div>
          </div>
          {!!discovery.newFields.length && (
            <div className="field-chips">
              {discovery.newFields.map((f) => (
                <span key={f}>{f}</span>
              ))}
            </div>
          )}
          <Button
            small
            variant="ghost"
            onClick={() => navigate('requests', { search: discovery.event?.operationName || '' })}
          >
            Исследовать запрос <ArrowRight size={14} />
          </Button>
        </Panel>
      )}
      <Panel
        title={
          <>
            <History size={16} /> История операций
          </>
        }
      >
        <div className="history-list">
          {history.map((h, i) => (
            <button
              key={i}
              onClick={() => {
                setQuery(h.query);
                setVariables(h.variables);
                setOperationName(h.operationName);
              }}
            >
              <Code2 size={14} />
              <code>{h.query.split('\n')[0]}</code>
              <span>{h.time}</span>
              <Badge>Повторить</Badge>
            </button>
          ))}
          {!history.length &&
            historyData?.items.map((h) => (
              <div className="safe-history" key={h.id}>
                <Code2 size={14} />
                <strong>{h.operationName}</strong>
                <span className="muted">{h.fields.length} полей · структура в Request Explorer</span>
                <button
                  className="text-button"
                  onClick={() => navigate('requests', { search: h.operationName })}
                >
                  Открыть
                </button>
              </div>
            ))}
        </div>
        <p className="footnote">
          Повторение доступно для запросов текущей сессии. Сохранённая история содержит безопасную структуру
          без исходных значений.
        </p>
      </Panel>
    </>
  );
}
