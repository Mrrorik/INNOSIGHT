import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Camera,
  GitCompareArrows,
  ArrowRight,
  ShieldAlert,
  Calculator,
  TrendingUp,
  Link2,
  RefreshCw,
  Plus,
  ShieldCheck,
  Layers,
  ExternalLink,
} from 'lucide-react';
import type { Analytics, Change, Project } from '../../../packages/shared/src/index.js';
import { api, post, base, queryClient, format, navigate } from './api';
import { ActivityChart } from './Overview';
import { Panel, PageTitle, Button, Badge, Empty, CopyButton } from './ui';
export function Changes({
  data,
  notify,
  token,
}: {
  data: Analytics;
  notify: (s: string, error?: boolean) => void;
  token: string;
}) {
  const [sdl, setSDL] = useState(''),
    [busy, setBusy] = useState(false),
    [changes, setChanges] = useState<Change[] | null>(null),
    [baseId, setBaseId] = useState(data.schema.id),
    [targetId, setTargetId] = useState('');
  const schemas = useQuery({
    queryKey: ['schemas', data.project.id],
    queryFn: () =>
      api<{ items: { id: string; sdl: string; createdAt: string }[] }>(base(data.project.id) + '/schemas'),
  });
  async function importSDL() {
    setBusy(true);
    try {
      await post(base(data.project.id) + '/schemas/import', { sdl, activate: false }, token);
      await queryClient.invalidateQueries();
      notify('Кандидат схемы сохранён. Активная схема не изменена.');
      setSDL('');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function compare() {
    setBusy(true);
    try {
      const result = await post<{ changes: Change[] }>(base(data.project.id) + '/schemas/diff', {
        baseId,
        targetId: targetId || schemas.data?.items.find((s) => s.id !== baseId)?.id,
      });
      setChanges(result.changes);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const list = changes || data.changes;
  return (
    <>
      <PageTitle
        eyebrow="CHANGE IMPACT INTELLIGENCE"
        title="Изменения схемы"
        description="Семантическое сравнение схем с реальными операциями клиентов и связанными тестами."
        actions={
          data.project.demo && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await post(base(data.project.id) + '/demo/changes');
                  setChanges(null);
                  await queryClient.invalidateQueries();
                  notify('Две реальные SDL-версии сравнены.');
                } catch (e) {
                  notify((e as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <GitCompareArrows size={16} />
              Показать breaking changes
            </Button>
          )
        }
      />
      <div className="change-value">
        <div>
          <ShieldAlert size={28} />
        </div>
        <p>
          <strong>Какие клиенты сломаются, если удалить поле?</strong> История наблюдений показывает
          затронутые операции. Она помогает оценить риск, но не доказывает отсутствие других потребителей.
        </p>
      </div>
      <Panel title="Сравнить сохранённые версии">
        <div className="schema-compare">
          <label>
            Базовая схема
            <select aria-label="Базовая схема" value={baseId} onChange={(e) => setBaseId(e.target.value)}>
              {schemas.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id.slice(0, 8)} {s.id === data.schema.id ? '· Active' : ''} ·{' '}
                  {new Date(s.createdAt).toLocaleTimeString('ru-RU')}
                </option>
              ))}
            </select>
          </label>
          <ArrowRight size={20} />
          <label>
            Кандидат
            <select
              aria-label="Кандидат схемы"
              value={targetId || schemas.data?.items.find((s) => s.id !== baseId)?.id || ''}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {schemas.data?.items
                .filter((s) => s.id !== baseId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id.slice(0, 8)} · {new Date(s.createdAt).toLocaleTimeString('ru-RU')}
                  </option>
                ))}
            </select>
          </label>
          <Button disabled={busy || (schemas.data?.items.length || 0) < 2} onClick={compare}>
            Compare
          </Button>
        </div>
      </Panel>
      <div className="metric-strip">
        <div>
          <GitCompareArrows size={22} />
          <strong>{list.filter((c) => c.severity === 'breaking').length}</strong>
          <span>Breaking changes</span>
        </div>
        <div>
          <ShieldAlert size={22} />
          <strong>{list.reduce((s, c) => s + c.observedRequests, 0)}</strong>
          <span>Связей change → request</span>
        </div>
        <div>
          <ShieldCheck size={22} />
          <strong>{new Set(list.flatMap((c) => c.testIds)).size}</strong>
          <span>Затронутых тестов</span>
        </div>
      </div>
      <Panel title="Наблюдаемое влияние на клиентов" action={<Badge>graphql-js semantic diff</Badge>}>
        {list.length ? (
          <div className="changes-list">
            {list.map((c, i) => (
              <article key={i}>
                <div className="flex-between">
                  <Badge tone={c.severity === 'breaking' ? 'red' : 'amber'}>{c.severity.toUpperCase()}</Badge>
                  <code className="color-violet">{c.coordinate || c.type}</code>
                </div>
                <h3>{c.description}</h3>
                <Badge tone="blue">
                  {c.impactBasis === 'type dependencies'
                    ? 'Зависимости типов и аргументов'
                    : c.impactBasis === 'field selections'
                      ? 'Наблюдаемые selections поля'
                      : 'Влияние требует ручного анализа'}
                </Badge>
                <div className="change-impact">
                  <div>
                    <small>Наблюдавшихся запросов</small>
                    <strong>{c.observedRequests}</strong>
                  </div>
                  <div>
                    <small>Затронутых операций</small>
                    <strong>{c.operations.length}</strong>
                  </div>
                  <div>
                    <small>Связанных тестов</small>
                    <strong>{c.testIds.length}</strong>
                  </div>
                </div>
                {c.impactBasis === 'type dependencies' && (
                  <div className="field-chips">
                    {c.affectedCoordinates.map((field) => (
                      <button key={field} onClick={() => navigate('requests', { field })}>
                        {field}
                      </button>
                    ))}
                  </div>
                )}
                <div className="field-chips">
                  {c.operations.map((o) => (
                    <button
                      key={o.fingerprint}
                      onClick={() => navigate('requests', { search: o.name, fingerprint: o.fingerprint })}
                    >
                      {o.name} · {o.requests} req <ExternalLink size={11} />
                    </button>
                  ))}
                  {c.testIds.map((t) => (
                    <span key={t} className="verified">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="muted">
                  {c.observedRequests
                    ? 'Изменение потенциально затрагивает эти операции по selections и зависимостям типов. Проверьте их до выпуска.'
                    : 'В собранной истории использование не обнаружено. Это не гарантия безопасного удаления.'}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Нужна вторая версия схемы"
            description="Импортируйте кандидат SDL или запустите эксперимент Detect Breaking Changes в Demo Lab."
          />
        )}
      </Panel>
      <Panel
        title="Импортировать кандидат SDL"
        subtitle="Сохраняется отдельная версия. Активный proxy продолжает анализировать текущую схему."
      >
        <textarea
          className="sdl-input"
          aria-label="Кандидат SDL"
          rows={8}
          placeholder="type Query { … }"
          value={sdl}
          onChange={(e) => setSDL(e.target.value)}
        />
        <Button disabled={!sdl.trim() || busy} onClick={importSDL}>
          <Plus size={15} />
          Сохранить кандидат
        </Button>
      </Panel>
    </>
  );
}
export function Reports({ data, notify }: { data: Analytics; notify: (s: string, error?: boolean) => void }) {
  const [label, setLabel] = useState('Контрольная точка'),
    [busy, setBusy] = useState(false);
  const latest = data.snapshots[0],
    previous = data.snapshots[1];
  return (
    <>
      <PageTitle
        eyebrow="REPORTING / EVIDENCE & EXPORTS"
        title="Отчёты и контрольные точки"
        description="Поделитесь результатами анализа, сохраните контрольную точку и сравните покрытие."
      />
      <div className="export-grid">
        {[
          {
            format: 'html',
            icon: FileText,
            title: 'Executive report',
            description: 'Оформленный HTML-отчёт с печатью в PDF',
            label: 'Открыть отчёт',
          },
          {
            format: 'json',
            icon: FileJson,
            title: 'Полный JSON',
            description: 'Метрики, поля, риски и методология расчёта',
            label: 'Скачать JSON',
          },
          {
            format: 'csv',
            icon: FileSpreadsheet,
            title: 'Coverage CSV',
            description: 'Таблица output-полей для Excel и аналитики',
            label: 'Скачать CSV',
          },
          {
            format: 'risks',
            icon: ShieldAlert,
            title: 'Risk findings',
            description: 'Приоритеты проверки с объяснениями',
            label: 'Экспорт рисков',
          },
        ].map((r) => (
          <Panel key={r.format} className="export-card">
            <div className="export-icon">
              <r.icon size={26} />
            </div>
            <h3>{r.title}</h3>
            <p>{r.description}</p>
            <a
              className="button"
              href={base(data.project.id) + '/report/' + r.format}
              target={r.format === 'html' ? '_blank' : undefined}
              rel="noreferrer"
              download={r.format === 'html' ? undefined : true}
            >
              <Download size={15} />
              {r.label}
            </a>
          </Panel>
        ))}
      </div>
      <Panel
        title={
          <>
            <Camera size={17} /> Контрольные точки покрытия
          </>
        }
        subtitle="Snapshots сохраняют фактические значения и версию схемы на момент создания."
      >
        <div className="snapshot-create">
          <input
            aria-label="Название контрольной точки"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button
            variant="primary"
            disabled={busy || !label.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await post(base(data.project.id) + '/snapshots', { label });
                await queryClient.invalidateQueries();
                notify('Контрольная точка сохранена в PostgreSQL.');
              } catch (e) {
                notify((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Camera size={15} />
            Сохранить snapshot
          </Button>
        </div>
        {latest && previous && (
          <div className="snapshot-comparison">
            <div>
              <span>{previous.label}</span>
              <strong>
                {format(previous.selectionCoverage)}% / {format(previous.verifiedCoverage)}%
              </strong>
            </div>
            <ArrowRight />
            <div>
              <span>{latest.label}</span>
              <strong>
                {format(latest.selectionCoverage)}% / {format(latest.verifiedCoverage)}%
              </strong>
            </div>
            <Badge tone={previous.schemaId === latest.schemaId ? 'green' : 'amber'}>
              {previous.schemaId === latest.schemaId
                ? `Selection ${format(latest.selectionCoverage - previous.selectionCoverage)} п.п. · Verified ${format(latest.verifiedCoverage - previous.verifiedCoverage)} п.п.`
                : 'Разные версии: прямое сравнение ограничено'}
            </Badge>
          </div>
        )}
        {data.snapshots.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Контрольная точка</th>
                  <th>Время</th>
                  <th>Selection</th>
                  <th>Verified</th>
                  <th>Schema</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.map((s) => (
                  <tr key={s.id}>
                    <td>{s.label}</td>
                    <td className="muted">{new Date(s.createdAt).toLocaleString('ru-RU')}</td>
                    <td className="color-blue">{format(s.selectionCoverage)}%</td>
                    <td className="color-green">{format(s.verifiedCoverage)}%</td>
                    <td className="mono muted">{s.schemaId.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Сохраните исходную точку"
            description="Запустите трафик или тесты, затем создайте вторую точку, чтобы увидеть измеримое изменение."
          />
        )}
      </Panel>
      <Panel title="Как интерпретировать отчёт">
        <p className="explanation">
          Selection coverage отражает выбор полей в валидных GraphQL-операциях, с учётом operationName и
          известных директив. Verified coverage отражает пути успешных assertions зарегистрированных тестов.
          Ни один показатель не доказывает выполнение всех resolver или отсутствие дефектов. Риски —
          объяснимые эвристики. Отчёты health используют последние 24 часа, покрытие накопительное в рамках
          текущей версии схемы.
        </p>
      </Panel>
    </>
  );
}
export function Business({ data }: { data: Analytics }) {
  const [team, setTeam] = useState(6),
    [rate, setRate] = useState(3500),
    [hours, setHours] = useState(4),
    [saving, setSaving] = useState(40);
  const savedHours = (team * hours * saving) / 100;
  return (
    <>
      <PageTitle
        eyebrow="BUSINESS IMPACT / PRODUCT VALUE"
        title="Оценка эффекта"
        description="INNOSIGHT помогает командам проверять изменения GraphQL API до того, как они затронут клиентов."
      />
      <div className="business-evidence">
        {[
          {
            value: data.metrics.total - data.metrics.verified,
            label: 'полей без тестового подтверждения',
            tone: 'amber',
          },
          { value: data.metrics.errors, label: 'фактических ошибок за период', tone: 'red' },
          {
            value: data.risks.filter((r) => r.severity === 'high').length,
            label: 'рекомендаций высокого приоритета',
            tone: 'red',
          },
          {
            value: format(data.metrics.selectionCoverage) + '%',
            label: 'накопительное selection coverage',
            tone: 'blue',
          },
          {
            value: data.changes.filter((c) => c.severity === 'breaking').length,
            label: 'breaking changes в сравнении схем',
            tone: 'violet',
          },
          {
            value: data.metrics.successfulTests,
            label: 'успешных тестов в последних 30 прогонах',
            tone: 'green',
          },
        ].map((s) => (
          <div key={s.label}>
            <strong className={'color-' + s.tone}>{s.value}</strong>
            <span>{s.label}</span>
          </div>
        ))}
      </div>
      <Panel
        title={
          <>
            <Calculator size={18} /> Иллюстративная ROI-модель
          </>
        }
        action={<Badge tone="amber">ПОЛЬЗОВАТЕЛЬСКИЕ ПРЕДПОЛОЖЕНИЯ</Badge>}
        subtitle="Расчёт по вашим оценкам. Это не доказанная экономия реальных компаний."
      >
        <div className="roi-grid">
          <div className="roi-inputs">
            {[
              { name: 'Размер команды', value: team, set: setTeam, min: 1, max: 100, step: 1, unit: 'чел.' },
              {
                name: 'Стоимость часа',
                value: rate,
                set: setRate,
                min: 100,
                max: 20000,
                step: 100,
                unit: '₽',
              },
              {
                name: 'Ручной анализ на человека в неделю',
                value: hours,
                set: setHours,
                min: 1,
                max: 40,
                step: 1,
                unit: 'ч.',
              },
              {
                name: 'Предполагаемая экономия времени',
                value: saving,
                set: setSaving,
                min: 0,
                max: 100,
                step: 5,
                unit: '%',
              },
            ].map((input) => (
              <label key={input.name}>
                <div>
                  <span>{input.name}</span>
                  <strong>
                    {format(input.value)} {input.unit}
                  </strong>
                </div>
                <input
                  aria-label={input.name}
                  type="range"
                  min={input.min}
                  max={input.max}
                  step={input.step}
                  value={input.value}
                  onChange={(e) => input.set(Number(e.target.value))}
                />
              </label>
            ))}
          </div>
          <div className="roi-result">
            <TrendingUp size={27} />
            <span>Предполагаемая экономия в неделю</span>
            <strong>
              {format(savedHours * rate)} <small>₽</small>
            </strong>
            <p>{format(savedHours)} часов команды</p>
            <div>Команда × часы анализа × доля экономии × ставка</div>
            <Badge tone="violet">Оценка, не гарантия</Badge>
          </div>
        </div>
      </Panel>
      <Panel title="Динамика наблюдаемого покрытия">
        <div className="chart" style={{ height: 230, margin: '0 20px 20px' }}>
          <ActivityChart data={data} kind="coverage" />
        </div>
      </Panel>
      <div className="product-value-grid">
        <Panel title="Разработчикам">
          <p>
            Операции и выбранные поля показывают реальное использование API. Change Impact связывает изменения
            схемы с наблюдавшимися потребителями.
          </p>
        </Panel>
        <Panel title="QA и техлидам">
          <p>
            Разделение observed и verified помогает находить пробелы в тестах. Риски объясняют, что проверять
            в первую очередь.
          </p>
        </Panel>
        <Panel title="Командам платформы">
          <p>
            Один proxy объединяет usage intelligence, runtime health и тестовое подтверждение. Экспорт
            позволяет включить результаты в ревью API.
          </p>
        </Panel>
      </div>
    </>
  );
}
export function Settings({
  data,
  notify,
  token,
  setToken,
  onProject,
}: {
  data: Analytics;
  notify: (s: string, error?: boolean) => void;
  token: string;
  setToken: (s: string) => void;
  onProject: (p: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [sdl, setSDL] = useState(''),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [upstream, setUpstream] = useState('');
  const meta = useQuery({
    queryKey: ['meta'],
    queryFn: () => api<{ adminConfigured: boolean; mode: string; unsupported: string[] }>('/api/meta'),
  });
  async function refresh() {
    setBusy(true);
    try {
      await post(base(data.project.id) + '/schemas/introspect', {}, token);
      await queryClient.invalidateQueries();
      notify('Схема обновлена через introspection.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="WORKSPACE / SETTINGS & INTEGRATIONS"
        title="Подключения и настройки"
        description="Локальный demo project готов к работе. Внешние подключения настраиваются администратором."
      />
      <div className="settings-grid">
        <Panel
          title={
            <>
              <Link2 size={17} /> Активное подключение
            </>
          }
          action={
            <Badge tone={data.project.demo ? 'blue' : 'violet'}>
              {data.project.demo ? 'DEMO MODE' : 'CONFIGURED API'}
            </Badge>
          }
        >
          <dl className="settings-list">
            <dt>Проект</dt>
            <dd>{data.project.name}</dd>
            <dt>Upstream</dt>
            <dd>
              <code>{data.project.upstream}</code>
            </dd>
            <dt>Proxy endpoint</dt>
            <dd>
              <code>
                {location.origin}/proxy/{data.project.id}/graphql
              </code>
              <CopyButton value={location.origin + '/proxy/' + data.project.id + '/graphql'} />
            </dd>
            <dt>Schema version</dt>
            <dd>
              <code>{data.schema.id}</code>
            </dd>
            <dt>Данные</dt>
            <dd>PostgreSQL · история сохраняется между перезапусками</dd>
          </dl>
          <Button disabled={busy} onClick={refresh}>
            <RefreshCw size={15} />
            Обновить schema introspection
          </Button>
        </Panel>
        <Panel
          title={
            <>
              <ShieldCheck size={17} /> Безопасность и приватность
            </>
          }
        >
          <div className="privacy-items">
            <p>
              <ShieldCheck size={16} />
              Authorization, API keys, значения variables и response body не записываются в историю.
            </p>
            <p>
              <ShieldCheck size={16} />
              Литеральные значения GraphQL скрываются до сохранения операции.
            </p>
            <p>
              <ShieldCheck size={16} />
              Внешние URL разрешаются только точным серверным allowlist. Redirects отключены.
            </p>
            <p>
              <ShieldCheck size={16} />
              Timeout 10 секунд · request limit 128 KiB · response limit 5 MiB.
            </p>
          </div>
          <Badge tone="amber">Demo-действия доступны без авторизации</Badge>
        </Panel>
      </div>
      <Panel title="Административный доступ">
        <p className="muted">
          Токен нужен для создания внешних проектов, импорта их схем и запуска зарегистрированных тестов. Он
          хранится только в памяти текущей вкладки.
        </p>
        <label className="form-label">
          ADMIN_TOKEN
          <input
            type="password"
            autoComplete="off"
            aria-label="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Токен из серверного окружения"
          />
        </label>
        <Badge tone={meta.data?.adminConfigured ? 'green' : 'neutral'}>
          {meta.data?.adminConfigured
            ? 'ADMIN_TOKEN задан на сервере'
            : 'ADMIN_TOKEN не задан: внешние подключения выключены'}
        </Badge>
      </Panel>
      <Panel
        title="Подключить собственный GraphQL API"
        subtitle="Требуются ADMIN_TOKEN и точный HTTPS URL в UPSTREAM_ALLOWLIST серверного окружения."
      >
        <div className="settings-form">
          <label>
            Название проекта
            <input
              aria-label="Название внешнего проекта"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            HTTPS endpoint
            <input
              aria-label="Внешний endpoint"
              value={upstream}
              onChange={(e) => setUpstream(e.target.value)}
              placeholder="https://api.example.com/graphql"
            />
          </label>
          <label className="wide">
            Описание
            <input
              aria-label="Описание проекта"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="wide">
            SDL (необязательно, если доступен introspection)
            <textarea
              aria-label="SDL внешнего проекта"
              value={sdl}
              onChange={(e) => setSDL(e.target.value)}
              rows={5}
            />
          </label>
        </div>
        <Button
          variant="primary"
          disabled={busy || !name || !upstream || !token}
          onClick={async () => {
            setBusy(true);
            try {
              const project = await post<Project>(
                '/api/projects',
                { name, description, upstream, ...(sdl ? { sdl } : {}) },
                token,
              );
              await queryClient.invalidateQueries();
              onProject(project.id);
              notify('Проект подключён.');
            } catch (e) {
              notify((e as Error).message, true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus size={15} />
          Создать подключение
        </Button>
        <details className="config-example">
          <summary>Пример серверной конфигурации</summary>
          <pre className="code-block">
            {
              'ADMIN_TOKEN=<your-local-admin-token>\nUPSTREAM_ALLOWLIST=https://api.example.com/graphql\n\ndocker compose up --build'
            }
          </pre>
          <p className="muted">
            Для приватного API импортируйте SDL, затем передавайте Authorization клиентским запросом через
            proxy. Статический upstream secret в UI не сохраняется. Для автоматических тестов можно задать
            UPSTREAM_HEADERS_JSON на сервере: credentials привязаны к точному URL из allowlist.
          </p>
        </details>
      </Panel>
      <Panel
        title={
          <>
            <Layers size={16} /> Поддерживаемый транспорт
          </>
        }
      >
        <div className="transport-grid">
          <div>
            <Badge tone="green">SUPPORTED</Badge>
            <p>
              GraphQL JSON POST, query GET, variables, operationName, query и mutation, aliases, fragments,
              directives, abstract selections.
            </p>
          </div>
          <div>
            <Badge tone="amber">NOT SUPPORTED</Badge>
            <p>{meta.data?.unsupported.join(' · ')}</p>
          </div>
        </div>
      </Panel>
    </>
  );
}
