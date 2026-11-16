import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Square, Download, ArrowRight, Terminal } from 'lucide-react';
import type { Analytics, CaptureSummary, CaptureReport } from '../../../packages/shared/src/index.js';
import { api, post, base, queryClient, format, navigate } from './api';
import { PageTitle, Panel, Button, Badge, CopyButton, Empty, Loading, ErrorBox, SearchBox } from './ui';
export function CaptureLab({
  data,
  token,
  notify,
}: {
  data: Analytics;
  token: string;
  notify: (message: string, error?: boolean) => void;
}) {
  const [label, setLabel] = useState('Регрессионный прогон'),
    [selected, setSelected] = useState<string | null>(null),
    [issued, setIssued] = useState<{ id: string; token: string } | null>(null),
    [busy, setBusy] = useState(false),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all');
  const list = useQuery({
    queryKey: ['captures', data.project.id],
    queryFn: () => api<{ items: CaptureSummary[] }>(base(data.project.id) + '/captures'),
  });
  const id = selected || list.data?.items[0]?.id;
  const report = useQuery({
    queryKey: ['capture', data.project.id, id],
    enabled: !!id,
    queryFn: () => api<CaptureReport>(base(data.project.id) + '/captures/' + id),
  });
  async function create() {
    setBusy(true);
    try {
      const result = await post<CaptureReport & { token: string }>(
        base(data.project.id) + '/captures',
        { label },
        token,
      );
      setIssued({ id: result.id, token: result.token });
      setSelected(result.id);
      await queryClient.invalidateQueries();
      notify('Прогон создан. Добавьте его токен в заголовок запросов автотестов.');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    try {
      await post(base(data.project.id) + '/captures/' + id + '/finish', {}, token);
      await queryClient.invalidateQueries();
      notify('Прогон завершён. Отчёт сохранён.');
      setIssued(null);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  const endpoint = location.origin + '/proxy/' + data.project.id + '/graphql';
  const activeToken = issued && issued.id === id ? issued.token : null;
  const command = `curl '${endpoint}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'X-Innosight-Capture: ${activeToken || '<TOKEN_ИЗ_СОЗДАНИЯ_ПРОГОНА>'}' \\\n  --data '{"query":"query CatalogCheck { products { id name price } }"}'`;
  const fields =
    report.data?.fields.filter(
      (f) =>
        f.coordinate.toLowerCase().includes(search.toLowerCase()) &&
        (filter === 'all' ||
          (filter === 'selected' && f.selected) ||
          (filter === 'unselected' && !f.selected)),
    ) || [];
  return (
    <>
      <PageTitle
        eyebrow="КАЧЕСТВО API / ВНЕШНИЕ АВТОТЕСТЫ"
        title="Прогоны автотестов"
        description="Направьте существующие тесты через proxy и получите покрытие конкретного запуска — по типам и полям."
        actions={
          <a className="button" href="/START_HERE.html" target="_blank" rel="noreferrer">
            Инструкция подключения <ArrowRight size={14} />
          </a>
        }
      />
      <Panel
        title="Начать новый прогон"
        subtitle="Не требует переписывать тесты: замените GraphQL endpoint и добавьте один заголовок."
      >
        <div className="capture-create">
          <label>
            Название прогона
            <input
              aria-label="Название прогона"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
            />
          </label>
          <Button variant="primary" onClick={create} disabled={busy || !label.trim()}>
            <Plus size={15} />
            Создать прогон
          </Button>
        </div>
        <p className="footnote">
          Это учёт выбранных полей во внешних тестах. Verified coverage изменяется только после проверяемых
          assertions зарегистрированных тестов.
        </p>
      </Panel>
      <div className="capture-layout">
        <Panel title="История прогонов" action={<Badge>{list.data?.items.length || 0}</Badge>}>
          {list.isPending ? (
            <Loading />
          ) : list.error ? (
            <ErrorBox message={list.error.message} />
          ) : list.data?.items.length ? (
            <div className="capture-history">
              {list.data.items.map((run) => (
                <button
                  key={run.id}
                  className={id === run.id ? 'selected' : ''}
                  onClick={() => {
                    setSelected(run.id);
                    setSearch('');
                  }}
                >
                  <div>
                    <strong>{run.label}</strong>
                    <Badge tone={run.finishedAt ? 'neutral' : 'green'}>
                      {run.finishedAt ? 'Завершён' : 'Принимает запросы'}
                    </Badge>
                  </div>
                  <p>
                    {new Date(run.createdAt).toLocaleString('ru-RU')} · {run.requests} запросов
                  </p>
                  <div className="capture-history-metrics">
                    <span>{format(run.selectionCoverage)}% полей</span>
                    <span>{format(run.typeCoverage)}% типов</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="Прогонов ещё нет"
              description="Создайте прогон, затем отправьте запросы своих автотестов через его proxy endpoint."
            />
          )}
        </Panel>
        <div>
          {report.isPending && id ? (
            <Loading />
          ) : report.error ? (
            <ErrorBox message={report.error.message} />
          ) : (
            report.data && (
              <>
                <Panel
                  title={report.data.label}
                  action={
                    <div className="page-actions">
                      <a
                        className="button small"
                        download
                        href={base(data.project.id) + '/captures/' + id + '/report'}
                      >
                        <Download size={14} />
                        JSON
                      </a>
                      {!report.data.finishedAt && (
                        <Button small disabled={busy} onClick={finish}>
                          <Square size={12} />
                          Завершить прогон
                        </Button>
                      )}
                    </div>
                  }
                >
                  <div className="capture-stat-grid">
                    <div>
                      <small>Покрытие полей</small>
                      <strong data-testid="capture-coverage">{format(report.data.selectionCoverage)}%</strong>
                      <span>
                        {report.data.selectedFields} / {report.data.totalFields}
                      </span>
                    </div>
                    <div>
                      <small>Покрытие типов</small>
                      <strong>{format(report.data.typeCoverage)}%</strong>
                      <span>
                        {report.data.selectedTypes} / {report.data.totalTypes}
                      </span>
                    </div>
                    <div>
                      <small>Запросы / ошибки</small>
                      <strong>
                        {report.data.requests} / {report.data.errors}
                      </strong>
                      <span>P95 {report.data.p95Latency} ms</span>
                    </div>
                  </div>
                  <p className="footnote">
                    Schema {report.data.schemaId.slice(0, 8)} ·{' '}
                    {report.data.finishedAt
                      ? 'Завершён ' + new Date(report.data.finishedAt).toLocaleString('ru-RU')
                      : 'Изменения отображаются автоматически'}
                  </p>
                </Panel>
                {!report.data.finishedAt && (
                  <Panel
                    title={
                      <>
                        <Terminal size={16} />
                        Подключение тестов
                      </>
                    }
                  >
                    <div className="capture-connection">
                      <label>
                        GraphQL endpoint
                        <div>
                          <code>{endpoint}</code>
                          <CopyButton value={endpoint} />
                        </div>
                      </label>
                      {activeToken ? (
                        <>
                          <label>
                            Заголовок X-Innosight-Capture <Badge tone="amber">Токен показан один раз</Badge>
                            <div>
                              <code>{activeToken}</code>
                              <CopyButton value={activeToken} />
                            </div>
                          </label>
                          <div className="flex-between">
                            <strong>Проверить подключение через curl</strong>
                            <CopyButton value={command} />
                          </div>
                          <pre className="code-block">{command}</pre>
                        </>
                      ) : (
                        <p className="muted">
                          Токен доступен только сразу после создания прогона. Если он не сохранён, создайте
                          новый прогон. Существующий отчёт и история запросов остаются доступны.
                        </p>
                      )}
                      <p className="footnote">
                        Токен не сохраняется в браузерное хранилище и не передаётся upstream. В БД хранится
                        только SHA-256. После завершения токен перестаёт принимать запросы.
                      </p>
                    </div>
                  </Panel>
                )}
                <Panel title="Типы схемы">
                  <div className="capture-types">
                    {report.data.types.map((type) => (
                      <button key={type.name} onClick={() => setSearch(type.name + '.')}>
                        <span>{type.name}</span>
                        <div className="coverage-track">
                          <i style={{ width: type.coverage + '%' }} />
                        </div>
                        <strong>
                          {type.selected}/{type.total}
                        </strong>
                      </button>
                    ))}
                  </div>
                </Panel>
                <Panel title="Поля этого прогона">
                  <div className="filter-bar">
                    <SearchBox value={search} onChange={setSearch} placeholder="Найти поле в прогоне…" />
                    <select
                      aria-label="Поля прогона"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">Все поля</option>
                      <option value="selected">Затронуты тестами</option>
                      <option value="unselected">Не затронуты</option>
                    </select>
                    <Badge>{fields.length} полей</Badge>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Поле</th>
                          <th>Тип</th>
                          <th>Запросов</th>
                          <th>Ошибок</th>
                          <th>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fields.map((f) => (
                          <tr key={f.coordinate}>
                            <td>
                              <code>{f.coordinate}</code>
                            </td>
                            <td className="mono muted">{f.type}</td>
                            <td>{f.requests}</td>
                            <td>{f.failed}</td>
                            <td>
                              <Badge tone={f.selected ? 'blue' : 'neutral'}>
                                {f.selected ? 'Выбрано' : 'Не затронуто'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="footnote">{report.data.methodology}</p>
                </Panel>
                <Button onClick={() => navigate('requests', { capture: id! })}>
                  События прогона <ArrowRight size={14} />
                </Button>
              </>
            )
          )}
        </div>
      </div>
    </>
  );
}
