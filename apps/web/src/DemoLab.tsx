import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Radar,
  Radio,
  ScanEye,
  Zap,
  ShieldCheck,
  GitCompareArrows,
  Play,
  RotateCcw,
  ArrowRight,
  Check,
  LoaderCircle,
  Terminal,
  ArrowUpRight,
} from 'lucide-react';
import type { Analytics, Metrics } from '../../../packages/shared/src/index.js';
import { api, post, base, queryClient, format, navigate } from './api';
import { Panel, PageTitle, Button, Badge, ErrorBox } from './ui';
const scenarios = [
  {
    id: 'discover',
    letter: 'A',
    title: 'Discover the API',
    label: 'Открыть реальную схему',
    description: 'Introspection настоящего API. Типы, поля и связи становятся видимыми.',
    icon: Radar,
    color: 'blue',
    target: 'graph',
  },
  {
    id: 'traffic',
    letter: 'B',
    title: 'Generate Real Traffic',
    label: 'Запустить настоящий трафик',
    description: '9 GraphQL-запросов через proxy. Каждое поле оставляет наблюдаемый след.',
    icon: Radio,
    color: 'violet',
    target: 'requests',
  },
  {
    id: 'blindspots',
    letter: 'C',
    title: 'Reveal Blind Spots',
    label: 'Обнаружить слепые зоны',
    description: 'Какие поля никто не выбирал? Что до сих пор не подтверждено тестами?',
    icon: ScanEye,
    color: 'amber',
    target: 'coverage',
  },
  {
    id: 'incident',
    letter: 'D',
    title: 'Trigger an Incident',
    label: 'Воспроизвести инцидент',
    description: 'Resolver error, validation error и медленный запрос. Измеряем последствия.',
    icon: Zap,
    color: 'red',
    target: 'risks',
  },
  {
    id: 'recover',
    letter: 'E',
    title: 'Recover Confidence',
    label: 'Подтвердить assertions',
    description: 'Запускаем зарегистрированные тесты. Проверенное покрытие растёт доказуемо.',
    icon: ShieldCheck,
    color: 'green',
    target: 'tests',
  },
  {
    id: 'changes',
    letter: 'F',
    title: 'Detect Breaking Changes',
    label: 'Оценить последствия изменения',
    description: 'Семантический SDL diff и операции клиентов, которых затронет изменение.',
    icon: GitCompareArrows,
    color: 'violet',
    target: 'changes',
  },
];
interface ScenarioResult {
  id: string;
  scenario: string;
  message: string;
  before: Metrics;
  after: Metrics;
  details: unknown;
  createdAt?: string;
}
export function DemoLab({ data, notify }: { data: Analytics; notify: (s: string, error?: boolean) => void }) {
  const [active, setActive] = useState<string | null>(null),
    [completed, setCompleted] = useState<Record<string, ScenarioResult>>({}),
    [log, setLog] = useState<{ time: string; text: string; error?: boolean }[]>([]),
    [runningAll, setRunningAll] = useState(false),
    [resetConfirm, setResetConfirm] = useState(false),
    [resetting, setResetting] = useState(false);
  const history = useQuery({
    queryKey: ['demo-runs', data.project.id],
    queryFn: () => api<{ items: ScenarioResult[] }>(base(data.project.id) + '/demo/runs'),
  });
  useEffect(() => {
    if (!history.data || active || runningAll) return;
    const saved: Record<string, ScenarioResult> = {};
    for (const result of history.data.items) if (!saved[result.scenario]) saved[result.scenario] = result;
    setCompleted(saved);
    if (!history.data.items.length) setLog([]);
    else
      setLog((current) =>
        current.length
          ? current
          : history.data.items.map((result) => ({
              time: result.createdAt ? new Date(result.createdAt).toLocaleTimeString('ru-RU') : 'saved',
              text: result.message,
            })),
      );
  }, [history.data, active, runningAll]);
  const addLog = (text: string, error = false) =>
    setLog((l) => [{ time: new Date().toLocaleTimeString('ru-RU'), text, error }, ...l].slice(0, 30));
  async function scenario(id: string) {
    setActive(id);
    addLog(`→ ${scenarios.find((s) => s.id === id)?.title}`);
    try {
      const r = await post<ScenarioResult>(base(data.project.id) + '/demo/' + id);
      setCompleted((c) => ({ ...c, [id]: r }));
      addLog(r.message);
      await queryClient.invalidateQueries();
      return r;
    } catch (e) {
      addLog((e as Error).message, true);
      notify((e as Error).message, true);
      throw e;
    } finally {
      setActive(null);
    }
  }
  async function start() {
    setRunningAll(true);
    try {
      for (const s of scenarios) await scenario(s.id);
      notify('Полная демонстрация завершена: настоящий трафик, ошибки, тесты и change impact.');
    } catch {
    } finally {
      setRunningAll(false);
    }
  }
  async function reset() {
    setResetting(true);
    try {
      const r = await post(base(data.project.id) + '/reset');
      setCompleted({});
      setLog([]);
      setResetConfirm(false);
      await queryClient.invalidateQueries();
      notify(r.message);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setResetting(false);
    }
  }
  const busy = !!active || runningAll || resetting;
  return (
    <>
      <PageTitle
        eyebrow="ДЕМОНСТРАЦИЯ / СЦЕНАРИИ"
        title="Demo Lab"
        description="Готовые сценарии для проверки proxy, покрытия, ошибок и совместимости схемы."
        actions={
          <Button disabled={busy || !data.project.demo} onClick={() => setResetConfirm(true)}>
            <RotateCcw size={15} />
            Reset Demo
          </Button>
        }
      />
      <div className="demo-hero">
        <div className="demo-hero-content">
          <Badge tone="violet">
            <span className="status-dot" /> INTERACTIVE DEMO LAB
          </Badge>
          <div>
            <h2>Демонстрационный API готов</h2>
            <p>
              Запустите все шесть сценариев или выберите один. Каждый сценарий выполняет реальные
              backend-действия.
            </p>
          </div>
          <Button variant="primary" disabled={busy || !data.project.demo} onClick={start}>
            <Play size={16} fill="currentColor" />
            {runningAll ? 'Демонстрация выполняется…' : 'Start Demo · все 6 сценариев'}
            <ArrowUpRight size={16} />
          </Button>
          <div className="demo-hero-meta">
            <span>Локальный API</span>
            <span>Без внешних сервисов</span>
            <span>Повторяемые сценарии</span>
          </div>
        </div>
      </div>
      <div className="demo-progress">
        <span>LIVE EXPERIMENTS</span>
        <div>
          {scenarios.map((s) => (
            <span key={s.id} className={active === s.id ? 'active' : completed[s.id] ? 'done' : ''}>
              {completed[s.id] ? <Check size={13} /> : s.letter}
            </span>
          ))}
        </div>
        <strong>{Object.keys(completed).length} / 6 завершено</strong>
      </div>
      {!data.project.demo && (
        <ErrorBox message="Переключитесь на Demo Project: сценарии не запускаются на внешних API." />
      )}
      <div className="scenario-grid">
        {scenarios.map((s) => {
          const done = completed[s.id];
          return (
            <article
              className={`scenario-card ${s.color} ${active === s.id ? 'active' : ''} ${done ? 'completed' : ''}`}
              key={s.id}
            >
              <div className="scenario-top">
                <span className="scenario-icon">
                  <s.icon size={23} />
                </span>
                <span className="scenario-letter">EXPERIMENT {s.letter}</span>
                {done && <Check size={17} className="color-green" />}
              </div>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
              {done ? (
                <div className="scenario-outcome">
                  <span>
                    Запросы <b>+{done.after.requests - done.before.requests}</b>
                  </span>
                  <span>
                    Selection{' '}
                    <b>+{format(done.after.selectionCoverage - done.before.selectionCoverage)} п.п.</b>
                  </span>
                  <span>
                    Verified <b>+{format(done.after.verifiedCoverage - done.before.verifiedCoverage)} п.п.</b>
                  </span>
                </div>
              ) : (
                <div className="scenario-label">{s.label}</div>
              )}
              <div className="scenario-actions">
                <Button disabled={busy || !data.project.demo} onClick={() => scenario(s.id).catch(() => {})}>
                  {active === s.id ? <LoaderCircle size={14} className="spin" /> : <Play size={13} />}{' '}
                  {active === s.id ? 'Выполняется…' : done ? 'Повторить' : 'Запустить'}
                </Button>
                <button className="text-button" onClick={() => navigate(s.target)}>
                  Открыть <ArrowRight size={13} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <Panel
        title={
          <>
            <Terminal size={17} /> Журнал экспериментов
          </>
        }
        action={<Badge tone={active ? 'blue' : 'neutral'}>{active ? 'RUNNING' : 'READY'}</Badge>}
      >
        <div className="demo-console">
          {log.length ? (
            log.map((l, i) => (
              <div className={l.error ? 'color-red' : ''} key={i}>
                <span>{l.time}</span>
                <code>{l.text}</code>
              </div>
            ))
          ) : (
            <div>
              <span>system</span>
              <code>Готов к запуску. Выберите эксперимент или нажмите Start Demo.</code>
            </div>
          )}
        </div>
      </Panel>
      {resetConfirm && (
        <div className="modal-backdrop">
          <div role="dialog" aria-modal="true" aria-label="Сбросить Demo" className="modal">
            <div className="modal-icon">
              <RotateCcw size={24} />
            </div>
            <h2>Начать демонстрацию заново?</h2>
            <p>
              История demo project, результаты тестов, snapshots и кандидат схемы будут удалены. Бизнес-данные
              Demo API восстановятся, затем выполнятся 3 базовых запроса.
            </p>
            <p className="muted">Другие проекты не затрагиваются.</p>
            <div className="modal-actions">
              <Button disabled={resetting} onClick={() => setResetConfirm(false)}>
                Отмена
              </Button>
              <Button variant="danger" disabled={resetting} onClick={reset}>
                {resetting ? 'Сбрасываем…' : 'Сбросить Demo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
