import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Play,
  CheckCheck,
  FlaskConical,
  ChevronDown,
  ChevronRight,
  Plus,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ArrowUpRight,
} from 'lucide-react';
import type { Analytics, TestCase, TestRun } from '../../../packages/shared/src/index.js';
import { api, post, base, queryClient, format, time } from './api';
import { Panel, PageTitle, Button, Badge, Loading, ErrorBox, Empty } from './ui';
export function TestLab({
  data,
  notify,
  token,
}: {
  data: Analytics;
  notify: (s: string, error?: boolean) => void;
  token: string;
}) {
  const [running, setRunning] = useState<string | null>(null),
    [selected, setSelected] = useState<TestRun | null>(null),
    [open, setOpen] = useState<string | null>(null),
    [showCreate, setShowCreate] = useState(false),
    [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [fixtures, setFixtures] = useState('{}');
  const tests = useQuery({
    queryKey: ['tests', data.project.id],
    queryFn: () => api<{ items: TestCase[]; runs: TestRun[] }>(base(data.project.id) + '/tests'),
  });
  const suggestions = useQuery({
    queryKey: ['suggestions', data.project.id],
    queryFn: () =>
      api<{
        items: {
          name: string;
          query: string | null;
          requiresFixture: boolean;
          arguments: { name: string; type: string }[];
          reason: string;
        }[];
      }>(base(data.project.id) + '/tests/suggestions'),
  });
  const [name, setName] = useState('Проверка поля'),
    [query, setQuery] = useState('query NewTest { products { id name } }'),
    [assertions, setAssertions] = useState('[\n  {"path":"data.products.0.name","operator":"exists"}\n]');
  async function run(caseId?: string) {
    setRunning(caseId || 'all');
    try {
      const result = await post<TestRun>(base(data.project.id) + '/tests/run', { caseId }, token);
      setSelected(result);
      await queryClient.invalidateQueries();
      notify(
        `${result.passed} passed · ${result.failed} failed · verified +${format(result.after - result.before)} п.п.`,
        !!result.failed,
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setRunning(null);
    }
  }
  async function create() {
    setCreating(true);
    setCreateError('');
    try {
      await post(
        base(data.project.id) + '/tests',
        { name, query, variables: JSON.parse(fixtures), assertions: JSON.parse(assertions) },
        token,
      );
      setShowCreate(false);
      await queryClient.invalidateQueries({ queryKey: ['tests'] });
      notify('Тест зарегистрирован. Запустите его для проверки.');
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  const runData =
    (tests.data?.runs.some((r) => r.id === selected?.id) ? selected : null) || tests.data?.runs[0];
  return (
    <>
      <PageTitle
        eyebrow="QUALITY ENGINEERING / TEST INTELLIGENCE"
        title="Test Lab"
        description="Тесты выполняются через настоящий proxy. Только успешные assertions подтверждают поля."
        actions={
          <>
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus size={15} />
              Добавить тест
            </Button>
            <Button variant="primary" disabled={!!running} onClick={() => run()}>
              <Play size={15} />
              {running === 'all' ? 'Тестируем…' : 'Запустить весь набор'}
            </Button>
          </>
        }
      />
      <div className="test-confidence">
        <div className="confidence-orbit">
          <CheckCheck size={32} />
        </div>
        <div>
          <span className="eyebrow">VERIFIED CONFIDENCE</span>
          <h2>
            {format(data.metrics.verifiedCoverage)}
            <small>%</small>
          </h2>
          <p>
            {data.metrics.verified} из {data.metrics.total} полей подтверждены тестами
          </p>
        </div>
        <div className="confidence-note">
          <strong>Запрос ≠ пройденный тест</strong>
          <p>
            HTTP success + ожидаемый GraphQL status + непустой набор успешных assertions. Ошибки не повышают
            verified coverage.
          </p>
        </div>
      </div>
      {showCreate && (
        <Panel
          title="Зарегистрировать query-тест"
          action={
            <Button small onClick={() => setShowCreate(false)}>
              Закрыть
            </Button>
          }
        >
          <div className="test-create">
            <label>
              Название
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              GraphQL query
              <textarea value={query} onChange={(e) => setQuery(e.target.value)} rows={5} />
            </label>
            <label>
              Assertions (JSON array)
              <textarea value={assertions} onChange={(e) => setAssertions(e.target.value)} rows={5} />
            </label>
            <label>
              Variables / fixtures (JSON object)
              <textarea value={fixtures} onChange={(e) => setFixtures(e.target.value)} rows={3} />
            </label>
          </div>
          {createError && <ErrorBox message={createError} />}
          <Button variant="primary" onClick={create} disabled={creating}>
            {creating ? 'Сохраняем…' : 'Зарегистрировать'}
          </Button>
          <p className="footnote">
            Пользовательские mutation не регистрируются автоматически. Не добавляйте секреты в сохранённые
            тестовые fixtures.
          </p>
        </Panel>
      )}
      <div className="test-columns">
        <Panel
          title={
            <>
              <FlaskConical size={17} /> Зарегистрированные сценарии
            </>
          }
          action={<Badge>{tests.data?.items.length || 0} tests</Badge>}
        >
          {tests.isPending ? (
            <Loading />
          ) : tests.error ? (
            <ErrorBox message={tests.error.message} />
          ) : tests.data?.items.length ? (
            <div className="test-case-list">
              {tests.data.items.map((test) => {
                const result = runData?.results.find((r) => r.caseId === test.id);
                return (
                  <div className="test-case" key={test.id}>
                    <div className="test-case-header">
                      <button onClick={() => setOpen(open === test.id ? null : test.id)}>
                        {open === test.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        <span className={`test-icon ${result?.passed ? 'passed' : result ? 'failed' : ''}`}>
                          {result?.passed ? (
                            <CheckCircle2 size={16} />
                          ) : result ? (
                            <XCircle size={16} />
                          ) : (
                            <FlaskConical size={16} />
                          )}
                        </span>
                        <div>
                          <strong>{test.name}</strong>
                          <small>
                            {test.assertions.length} assertions
                            {test.expectedError ? ' · ожидаемая ошибка' : ''}
                          </small>
                        </div>
                      </button>
                      <Button
                        small
                        disabled={!!running}
                        onClick={() => run(test.id)}
                        title={'Запустить ' + test.name}
                      >
                        <Play size={13} />
                      </Button>
                    </div>
                    {open === test.id && (
                      <div className="test-case-body">
                        <pre className="code-block">{test.query}</pre>
                        <div className="assertion-list">
                          {test.assertions.map((a, i) => (
                            <div key={i}>
                              <code>{a.path}</code>
                              <Badge>{a.operator}</Badge>
                              {a.expected !== undefined && <span>{JSON.stringify(a.expected)}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Нет зарегистрированных тестов"
              description="Создайте query с assertions, используя схему API."
            />
          )}
        </Panel>
        <Panel
          title="Последний прогон"
          action={
            runData && (
              <Badge tone={runData.failed ? 'red' : 'green'}>{runData.failed ? 'FAILED' : 'PASSED'}</Badge>
            )
          }
        >
          {runData ? (
            <>
              <div className="run-summary">
                <div>
                  <strong className="color-green">{runData.passed}</strong>
                  <span>Passed</span>
                </div>
                <div>
                  <strong className={runData.failed ? 'color-red' : ''}>{runData.failed}</strong>
                  <span>Failed</span>
                </div>
                <div>
                  <strong className="color-violet">
                    +{format(runData.after - runData.before)}
                    <small>п.п.</small>
                  </strong>
                  <span>Verified coverage</span>
                </div>
              </div>
              <div className="run-results">
                {runData.results.map((r) => (
                  <details key={r.id}>
                    <summary>
                      {r.passed ? (
                        <CheckCircle2 size={15} className="color-green" />
                      ) : (
                        <XCircle size={15} className="color-red" />
                      )}
                      <span>{r.name}</span>
                      <small>{r.duration} ms</small>
                    </summary>
                    <div>
                      {r.error && <ErrorBox message={r.error} />}
                      <p>{r.verifiedFields.length} подтверждённых координат</p>
                      {r.assertions.map((a, i) => (
                        <div className="assertion-result" key={i}>
                          <span className={a.passed ? 'color-green' : 'color-red'}>
                            {a.passed ? '✓' : '×'}
                          </span>
                          <code>{a.path}</code>
                          <Badge tone={a.passed ? 'green' : 'red'}>{a.operator}</Badge>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
              <p className="footnote">
                {time(runData.createdAt)} · run {runData.id.slice(0, 8)}
              </p>
            </>
          ) : (
            <Empty
              title="Первый запуск ещё впереди"
              description="Запустите набор, чтобы получить настоящее тестовое подтверждение."
              action={
                <Button disabled={!!running} onClick={() => run()}>
                  <Play size={14} />
                  Запустить тесты
                </Button>
              }
            />
          )}
        </Panel>
      </div>
      <Panel
        title={
          <>
            <Lightbulb size={17} /> Предложения из схемы
          </>
        }
        subtitle="Безопасная генерация query. Обязательные аргументы требуют ваших fixtures."
      >
        <div className="suggestion-grid">
          {suggestions.data?.items.slice(0, 12).map((s) => (
            <div className="suggestion" key={s.name}>
              <div className="flex-between">
                <code>Query.{s.name}</code>
                <Badge tone={s.requiresFixture ? 'amber' : 'blue'}>
                  {s.requiresFixture ? 'Fixture required' : 'Query ready'}
                </Badge>
              </div>
              <p>
                {s.requiresFixture
                  ? s.arguments.map((a) => `${a.name}: ${a.type}`).join(', ')
                  : 'Скалярные поля и безопасные selections из схемы.'}
              </p>
              <Button
                small
                disabled={s.requiresFixture || !s.query}
                onClick={() => {
                  setShowCreate(true);
                  setName(`Проверка ${s.name}`);
                  setQuery(s.query!);
                  setAssertions('[\n  {"path":"data.' + s.name + '","operator":"exists"}\n]');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Создать тест <ArrowUpRight size={13} />
              </Button>
            </div>
          ))}
        </div>
      </Panel>
      {!!tests.data?.runs.length && (
        <Panel title="История прогонов">
          <div className="run-history">
            {tests.data.runs.map((r) => (
              <button key={r.id} onClick={() => setSelected(r)}>
                <span>{new Date(r.createdAt).toLocaleString('ru-RU')}</span>
                <Badge tone={r.failed ? 'red' : 'green'}>
                  {r.passed} passed / {r.failed} failed
                </Badge>
                <span>
                  {format(r.before)}% → {format(r.after)}%
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
