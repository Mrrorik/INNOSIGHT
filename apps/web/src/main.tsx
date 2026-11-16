import React, { useEffect, useState, useRef, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  FileBarChart,
  FlaskConical,
  GitCompareArrows,
  LayoutDashboard,
  Menu,
  Network,
  Radio,
  Search,
  Settings as SettingsIcon,
  ShieldAlert,
  Sparkles,
  SquareTerminal,
  TrendingUp,
  X,
  WifiOff,
  RefreshCw,
  ScanLine,
  Sun,
  Moon,
  Layers,
} from 'lucide-react';
import type { Analytics, Project, RequestEvent } from '../../../packages/shared/src/index.js';
import { api, post, base, queryClient, navigate } from './api';
import { Overview } from './Overview';
import { GraphUniverse } from './GraphUniverse';
const Explorer = lazy(() => import('./Explorer').then((module) => ({ default: module.Explorer })));
const Playground = lazy(() => import('./Playground').then((module) => ({ default: module.Playground })));
const Coverage = lazy(() => import('./Coverage').then((module) => ({ default: module.Coverage })));
const Risks = lazy(() => import('./Coverage').then((module) => ({ default: module.Risks })));
const CaptureLab = lazy(() => import('./CaptureLab').then((module) => ({ default: module.CaptureLab })));
const TestLab = lazy(() => import('./TestLab').then((module) => ({ default: module.TestLab })));
const DemoLab = lazy(() => import('./DemoLab').then((module) => ({ default: module.DemoLab })));
const Changes = lazy(() => import('./Commercial').then((module) => ({ default: module.Changes })));
const Reports = lazy(() => import('./Commercial').then((module) => ({ default: module.Reports })));
const Business = lazy(() => import('./Commercial').then((module) => ({ default: module.Business })));
const Settings = lazy(() => import('./Commercial').then((module) => ({ default: module.Settings })));
import { Badge, Button, Breadcrumb, PageTitle, Panel, Loading, ErrorBox, SearchBox } from './ui';
import './styles.css';
const nav = [
  { id: 'overview', label: 'Обзор', english: 'Overview', icon: LayoutDashboard },
  { id: 'graph', label: 'Graph Universe', english: 'Схема API', icon: Network },
  { id: 'requests', label: 'Live Requests', english: 'Request explorer', icon: Radio },
  { id: 'coverage', label: 'Покрытие схемы', english: 'Coverage', icon: ScanLine },
  { id: 'risks', label: 'Risk Intelligence', english: 'Priorities', icon: ShieldAlert },
  { id: 'tests', label: 'Test Lab', english: 'Verified confidence', icon: FlaskConical },
  { id: 'captures', label: 'Прогоны автотестов', english: 'Test captures', icon: Layers },
  { id: 'playground', label: 'Playground', english: 'GraphQL editor', icon: SquareTerminal },
  { id: 'demo', label: 'Demo Lab', english: 'Live experiments', icon: Sparkles },
  { id: 'changes', label: 'Change Impact', english: 'Breaking changes', icon: GitCompareArrows },
  { id: 'business', label: 'Business Impact', english: 'Product value', icon: TrendingUp },
  { id: 'reports', label: 'Отчёты', english: 'Reports & exports', icon: FileBarChart },
  { id: 'settings', label: 'Настройки', english: 'Settings & integrations', icon: SettingsIcon },
];
function Logo() {
  return (
    <div className="brand">
      <div className="brand-symbol">
        <span>I</span>
      </div>
      <div>
        <strong>INNOSIGHT</strong>
        <small>GRAPHQL INTELLIGENCE</small>
      </div>
    </div>
  );
}
class ScreenBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="startup-error">
        <ErrorBox message="Не удалось отобразить экран." />
        <p>Перезагрузите страницу, чтобы восстановить интерфейс. Сохранённые данные остаются в PostgreSQL.</p>
        <Button onClick={() => location.reload()}>Перезагрузить приложение</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function App() {
  const [theme, setTheme] = useState(localStorage.getItem('innosight-theme') || 'light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('innosight-theme', theme);
  }, [theme]);
  const [route, setRoute] = useState(location.hash.slice(2).split('?')[0] || 'overview'),
    [projectId, setProjectId] = useState(localStorage.getItem('innosight-project') || 'demo'),
    [range, setRange] = useState('24h'),
    [connected, setConnected] = useState(false),
    [toast, setToast] = useState<{ text: string; error: boolean } | null>(null),
    [token, setToken] = useState(''),
    [sidebar, setSidebar] = useState(false),
    [command, setCommand] = useState(false),
    [commandSearch, setCommandSearch] = useState(''),
    [welcome, setWelcome] = useState(!localStorage.getItem('innosight-onboarded')),
    [demoBusy, setDemoBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<{ items: Project[] }>('/api/projects'),
  });
  const result = useQuery({
    queryKey: ['analytics', projectId, range],
    queryFn: () => api<Analytics>(base(projectId) + '/analytics?range=' + range),
    refetchInterval: 30000,
  });
  const connection = useQuery({
    queryKey: ['connection', projectId],
    queryFn: () => api<{ connected: boolean; status: number }>(base(projectId) + '/connection'),
    refetchInterval: 30000,
  });
  const requestId = new URLSearchParams(location.hash.split('?')[1]).get('request');
  const selectedRequest = useQuery({
    queryKey: ['request', projectId, requestId],
    queryFn: () => api<RequestEvent>(base(projectId) + '/requests/' + requestId),
    enabled: route === 'graph' && !!requestId,
  });
  useEffect(() => {
    const change = () => {
      setRoute(location.hash.slice(2).split('?')[0] || 'overview');
      setSidebar(false);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommand((v) => !v);
      }
      if (e.key === 'Escape') {
        setCommand(false);
        setWelcome(false);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    localStorage.setItem('innosight-project', projectId);
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== 'connection' && q.queryKey[0] !== 'meta',
        });
      }, 160);
    };
    const source = new EventSource(base(projectId) + '/events');
    source.addEventListener('connected', () => {
      setConnected(true);
      refresh();
    });
    source.addEventListener('update', refresh);
    source.onerror = () => setConnected(false);
    source.onopen = () => {
      setConnected(true);
      refresh();
    };
    return () => {
      source.close();
      clearTimeout(refreshTimer);
      setConnected(false);
    };
  }, [projectId]);
  useEffect(() => {
    if (projects.data && !projects.data.items.some((p) => p.id === projectId)) setProjectId('demo');
  }, [projects.data, projectId]);
  function notify(text: string, error = false) {
    setToast({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 7000);
  }
  async function demo() {
    setDemoBusy(true);
    try {
      const r = await post(base(projectId) + '/demo/traffic');
      await queryClient.invalidateQueries();
      notify(r.message);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setDemoBusy(false);
    }
  }
  const current = nav.find((n) => n.id === route) || nav[0];
  const data = result.data;
  let content: React.ReactNode;
  if (result.isPending) content = <Loading />;
  else if (result.error)
    content = (
      <div className="startup-error">
        <ErrorBox message={result.error.message} />
        <h2>Не удалось получить аналитику</h2>
        <p>Проверьте backend и PostgreSQL. Если проект ещё не имеет схемы, импортируйте SDL через API.</p>
        <Button onClick={() => result.refetch()}>
          <RefreshCw size={15} />
          Повторить подключение
        </Button>
      </div>
    );
  else if (data) {
    switch (route) {
      case 'overview':
        content = <Overview data={data} onDemo={demo} busy={demoBusy} />;
        break;
      case 'graph':
        content = (
          <>
            <PageTitle
              eyebrow="SCHEMA INTELLIGENCE / LIVE UNIVERSE"
              title="Graph Universe"
              description="Исследуйте связи между типами, наблюдаемые selections и подтверждённые поля."
              actions={
                <Badge tone="blue">
                  {data.schema.types.length} типов / {data.fields.length} полей
                </Badge>
              }
            />
            {requestId && (
              <div className="graph-operation-notice">
                <Activity size={15} /> Подсветка операции:{' '}
                {selectedRequest.data?.operationName || 'Загрузка…'}
                <Button small variant="ghost" onClick={() => navigate('graph')}>
                  Снять подсветку
                </Button>
              </div>
            )}
            <Panel className="full-graph-panel">
              <GraphUniverse data={data} operationFields={selectedRequest.data?.fields} />
            </Panel>
            <p className="footnote">
              Цвет отражает статус выбора поля. Ошибки — корреляция с ошибочными операциями. Abstract
              selections показывают возможные ветви, а не факт выполнения resolver.
            </p>
          </>
        );
        break;
      case 'requests':
        content = <Explorer key={projectId + location.hash} data={data} range={range} />;
        break;
      case 'coverage':
        content = <Coverage key={projectId + location.hash} data={data} />;
        break;
      case 'risks':
        content = <Risks data={data} />;
        break;
      case 'captures':
        content = <CaptureLab key={projectId} data={data} token={token} notify={notify} />;
        break;
      case 'tests':
        content = <TestLab key={projectId} data={data} notify={notify} token={token} />;
        break;
      case 'playground':
        content = <Playground key={projectId} data={data} notify={notify} />;
        break;
      case 'demo':
        content = <DemoLab key={projectId} data={data} notify={notify} />;
        break;
      case 'changes':
        content = <Changes key={projectId} data={data} notify={notify} token={token} />;
        break;
      case 'reports':
        content = <Reports data={data} notify={notify} />;
        break;
      case 'business':
        content = <Business data={data} />;
        break;
      case 'settings':
        content = (
          <Settings data={data} notify={notify} token={token} setToken={setToken} onProject={setProjectId} />
        );
        break;
      default:
        content = <Overview data={data} onDemo={demo} busy={demoBusy} />;
    }
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebar ? 'open' : ''}`}>
        <Logo />
        <div className="workspace-select">
          <div className="workspace-avatar">
            N<span />
          </div>
          <div>
            <small>WORKSPACE</small>
            <select
              aria-label="Активный проект"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              {(projects.data?.items || [{ id: 'demo', name: 'Nexus Commerce' }]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={13} />
        </div>
        <button className="command-trigger" onClick={() => setCommand(true)}>
          <Search size={15} />
          <span>Быстрый переход</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="nav-label">АНАЛИЗ API</div>
        <nav>
          {nav.slice(0, 8).map((n) => (
            <button
              title={n.english}
              key={n.id}
              onClick={() => navigate(n.id)}
              className={route === n.id ? 'active' : ''}
            >
              <n.icon size={17} />
              <span>{n.label}</span>
              {n.id === 'requests' && <span className="nav-live" />}
              {n.id === 'risks' && !!data?.risks.filter((r) => r.severity === 'high').length && (
                <b>{data.risks.filter((r) => r.severity === 'high').length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="nav-label second">ПРОЕКТ</div>
        <nav>
          {nav.slice(8).map((n) => (
            <button
              title={n.english}
              key={n.id}
              onClick={() => navigate(n.id)}
              className={`${route === n.id ? 'active' : ''} ${n.id === 'demo' ? 'demo-nav' : ''}`}
            >
              <n.icon size={17} />
              <span>{n.label}</span>
              {n.id === 'demo' && <Badge tone="violet">LAB</Badge>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-mode">
            <span className="status-dot" />
            <div>
              <strong>Локальный режим</strong>
              <small>Ваши данные под контролем</small>
            </div>
            <ShieldAlert size={15} />
          </div>
          <button className="sidebar-profile" onClick={() => navigate('settings')}>
            <span>IS</span>
            <div>
              <strong>Demo Workspace</strong>
              <small>INNOSIGHT · v1.1</small>
            </div>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      {sidebar && <div className="sidebar-scrim" onClick={() => setSidebar(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <button className="mobile-menu" title="Меню" onClick={() => setSidebar((v) => !v)}>
            <Menu size={20} />
          </button>
          <Breadcrumb current={current.english} />
          <div className="topbar-right">
            <span className={`upstream-status ${connection.data?.connected ? '' : 'disconnected'}`}>
              <span className="status-dot" />
              Upstream {connection.data?.connected ? 'connected' : 'unavailable'}
            </span>
            <div className="topbar-separator" />
            <span className={`stream-status ${connected ? '' : 'disconnected'}`}>
              {connected ? <Radio size={13} /> : <WifiOff size={13} />} {connected ? 'LIVE' : 'RECONNECTING'}
            </span>
            <select aria-label="Временной диапазон" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="1h">Последний час</option>
              <option value="24h">Последние 24 часа</option>
              <option value="7d">Последние 7 дней</option>
              <option value="all">Вся история</option>
            </select>
            <Button
              small
              variant="ghost"
              title={theme === 'light' ? 'Тёмная тема' : 'Светлая тема'}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            >
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </Button>
            <button className="top-avatar" title="Настройки" onClick={() => navigate('settings')}>
              IS
            </button>
          </div>
        </header>
        <main>
          <ScreenBoundary key={projectId + route}>
            <Suspense fallback={<Loading />}>{content}</Suspense>
          </ScreenBoundary>
        </main>
        <footer className="app-footer">
          <span>
            INNOSIGHT <i /> GraphQL Intelligence
          </span>
          <span>
            <span className="status-dot" /> Локальное рабочее пространство
          </span>
        </footer>
      </div>
      {toast && (
        <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.error ? <ShieldAlert size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button title="Закрыть уведомление" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {command && (
        <div className="modal-backdrop" onClick={() => setCommand(false)}>
          <div
            className="command-palette"
            role="dialog"
            aria-label="Быстрый переход"
            onClick={(e) => e.stopPropagation()}
          >
            <SearchBox value={commandSearch} onChange={setCommandSearch} placeholder="Куда перейти?" />
            <div>
              {nav
                .filter((n) =>
                  (n.label + ' ' + n.english).toLowerCase().includes(commandSearch.toLowerCase()),
                )
                .map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      navigate(n.id);
                      setCommand(false);
                      setCommandSearch('');
                    }}
                  >
                    <n.icon size={18} />
                    <span>{n.label}</span>
                    <small>{n.english}</small>
                    <ChevronRight size={14} />
                  </button>
                ))}
            </div>
            <p>Esc — закрыть · ⌘/Ctrl K — открыть</p>
          </div>
        </div>
      )}
      {welcome && (
        <div className="modal-backdrop">
          <div
            role="dialog"
            aria-label="Добро пожаловать в INNOSIGHT"
            aria-modal="true"
            className="welcome-modal"
          >
            <button
              className="welcome-close"
              title="Закрыть"
              onClick={() => {
                setWelcome(false);
                localStorage.setItem('innosight-onboarded', '1');
              }}
            >
              <X size={20} />
            </button>
            <Logo />
            <div className="welcome-visual">
              <Network size={55} />
              <i />
              <b />
            </div>
            <Badge tone="violet">СЕТЬ ГЛАЗАМИ БОГА</Badge>
            <h2>Покрытие GraphQL API</h2>
            <p>
              Демонстрационный API подключён. Создайте прогон своих автотестов или откройте готовые сценарии,
              чтобы увидеть, какие типы и поля покрыты запросами.
            </p>
            <div className="welcome-steps">
              <span>
                <b>01</b>Исследуйте схему
              </span>
              <span>
                <b>02</b>Отправьте запрос
              </span>
              <span>
                <b>03</b>Подтвердите тестами
              </span>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                setWelcome(false);
                localStorage.setItem('innosight-onboarded', '1');
                navigate('demo');
              }}
            >
              Открыть Demo Lab <ArrowUpRight size={16} />
            </Button>
            <button
              className="text-button"
              onClick={() => {
                setWelcome(false);
                localStorage.setItem('innosight-onboarded', '1');
              }}
            >
              Перейти к Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
