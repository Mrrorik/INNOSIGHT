import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import {
  Activity,
  ArrowUpRight,
  ArrowRight,
  CheckCheck,
  ScanLine,
  Timer,
  Radio,
  ShieldAlert,
  GitBranch,
  Box,
  Code2,
} from 'lucide-react';
import type { Analytics } from '../../../packages/shared/src/index.js';
import { Panel, Badge, LinkAction, PageTitle, Button } from './ui';
import { GraphUniverse } from './GraphUniverse';
import { format, navigate, time } from './api';
const tooltipStyle = {
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  color: 'var(--text)',
  fontSize: 12,
};
const axis = { stroke: '#5f6e89', fontSize: 10, tickLine: false, axisLine: false };
export function ActivityChart({
  data,
  kind = 'requests',
}: {
  data: Analytics;
  kind?: 'requests' | 'coverage' | 'errors' | 'latency';
}) {
  const color = kind === 'errors' ? '#dc6363' : kind === 'coverage' ? '#278673' : '#527fba';
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data.timeline} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id={`fill-${kind}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.35} />
            <stop offset="1" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="3 5" />
        <XAxis
          {...axis}
          dataKey="time"
          minTickGap={50}
          tickFormatter={(s) =>
            new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
          }
        />
        <YAxis {...axis} allowDecimals={kind === 'coverage' || kind === 'latency'} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(s) => new Date(String(s)).toLocaleString('ru-RU')}
          formatter={(v) => [
            `${format(Number(v))}${kind === 'coverage' ? '%' : kind === 'latency' ? ' ms' : ''}`,
            kind === 'requests'
              ? 'Запросы'
              : kind === 'errors'
                ? 'Ошибки'
                : kind === 'coverage'
                  ? 'Coverage'
                  : 'Latency',
          ]}
        />
        <Area
          type="monotone"
          dataKey={kind}
          stroke={color}
          strokeWidth={2}
          fill={`url(#fill-${kind})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
function Sparkline({ data, color }: { data: number[]; color: string }) {
  return (
    <div className="sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map((value) => ({ value }))}>
          <Line dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Overview({ data, onDemo, busy }: { data: Analytics; onDemo: () => void; busy: boolean }) {
  const m = data.metrics;
  const byType = data.schema.types
    .filter((t) => data.fields.some((f) => f.typeName === t.name))
    .map((t) => {
      const fields = data.fields.filter((f) => f.typeName === t.name);
      return {
        name: t.name,
        total: fields.length,
        observed: fields.filter((f) => f.observed).length,
        verified: fields.filter((f) => f.verified).length,
      };
    })
    .sort((a, b) => b.observed - a.observed)
    .slice(0, 7);
  return (
    <>
      <PageTitle
        eyebrow="РАБОЧЕЕ ПРОСТРАНСТВО / ОБЗОР"
        title="Обзор API"
        description="Использование схемы, подтверждение тестами и состояние запросов в одном рабочем пространстве."
        actions={
          <Button variant="primary" onClick={onDemo} disabled={busy || !data.project.demo}>
            <Activity size={16} />
            {busy ? 'Выполняем…' : 'Запустить live demo'}
            <ArrowUpRight size={15} />
          </Button>
        }
      />
      <div className="context-strip">
        <div>
          <span className="status-dot" />
          <strong>{data.project.name}</strong>
          <Badge tone="violet">{data.project.demo ? 'DEMO PROJECT' : 'CONNECTED API'}</Badge>
          <span className="muted">
            {data.schema.types.length} типов / {m.total} полей
          </span>
        </div>
        <span>
          <GitBranch size={13} /> schema {data.schema.id.slice(0, 8)}
        </span>
      </div>
      <div className="kpi-grid">
        <div className="kpi-card violet">
          <div className="kpi-label">
            <ScanLine size={16} /> Selection coverage{' '}
            <span title="Выбранные output-поля / все output-поля текущей схемы">ⓘ</span>
          </div>
          <div className="kpi-value" data-testid="selection-coverage">
            {format(m.selectionCoverage)}
            <small>%</small>
          </div>
          <div className="kpi-bottom">
            <span>
              {m.observed} из {m.total} полей
            </span>
            <Sparkline data={data.timeline.map((p) => p.coverage)} color="#446f9f" />
          </div>
          <div className="kpi-progress">
            <i style={{ width: m.selectionCoverage + '%' }} />
          </div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">
            <CheckCheck size={16} /> Verified test coverage{' '}
            <span title="Только пути успешных assertions зарегистрированных тестов">ⓘ</span>
          </div>
          <div className="kpi-value" data-testid="verified-coverage">
            {format(m.verifiedCoverage)}
            <small>%</small>
          </div>
          <div className="kpi-bottom">
            <span>{m.verified} подтверждённых полей</span>
            <span className="mini-icon">
              <CheckCheck size={23} />
            </span>
          </div>
          <div className="kpi-progress">
            <i style={{ width: m.verifiedCoverage + '%' }} />
          </div>
        </div>
        <div className="kpi-card blue">
          <div className="kpi-label">
            <Radio size={16} /> Реальные запросы
          </div>
          <div className="kpi-value">
            {format(m.requests)}
            <small>req</small>
          </div>
          <div className="kpi-bottom">
            <span>За выбранный период</span>
            <Sparkline data={data.timeline.map((p) => p.requests)} color="#6489ab" />
          </div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-label">
            <Timer size={16} /> P95 latency
          </div>
          <div className="kpi-value">
            {format(m.p95Latency)}
            <small>ms</small>
          </div>
          <div className="kpi-bottom">
            <span>Среднее: {m.averageLatency} ms</span>
            <Sparkline data={data.timeline.map((p) => p.latency)} color="#af9567" />
          </div>
        </div>
      </div>
      <div className="overview-main">
        <Panel
          title={
            <>
              <span className="heading-icon">
                <Box size={15} />
              </span>
              Schema Universe <Badge tone="blue">LIVE</Badge>
            </>
          }
          subtitle="Связи типов и статус выбранных полей"
          action={<LinkAction onClick={() => navigate('graph')}>Исследовать</LinkAction>}
          className="universe-panel"
        >
          <GraphUniverse data={data} compact />
        </Panel>
        <div className="overview-side">
          <Panel
            title="Активность запросов"
            action={
              <span className="live-label">
                <span className="status-dot" />
                LIVE
              </span>
            }
          >
            <div className="activity-summary">
              <strong>{format(m.requests)}</strong>
              <span>запросов через proxy</span>
            </div>
            <div className="chart activity-chart">
              <ActivityChart data={data} />
            </div>
          </Panel>
          <Panel
            className="health-panel"
            title="Runtime health"
            action={<ShieldAlert size={16} className={m.errors ? 'color-red' : 'color-green'} />}
          >
            <div className="health-numbers">
              <div>
                <strong className={m.errors ? 'color-red' : 'color-green'}>
                  {format(m.errorRate)}
                  <small>%</small>
                </strong>
                <span>Error rate</span>
              </div>
              <div>
                <strong>{m.errors}</strong>
                <span>ошибочных запросов</span>
              </div>
              <div>
                <strong className="color-amber">{m.unobserved}</strong>
                <span>слепых зон</span>
              </div>
            </div>
            <button className="health-link" onClick={() => navigate('risks')}>
              {m.errors ? 'Расследовать ошибки' : 'Найти зоны риска'}
              <ArrowRight size={14} />
            </button>
          </Panel>
        </div>
      </div>
      <div className="insight-banner">
        <div className="insight-symbol">
          <ScanLine size={23} />
        </div>
        <div>
          <strong>{m.total - m.verified} полей ждут проверок</strong>
          <p>Наблюдаемый трафик показывает использование. Успешные assertions дают подтверждение.</p>
        </div>
        <Button small onClick={() => navigate('tests')}>
          Открыть Test Lab <ArrowRight size={14} />
        </Button>
      </div>
      <div className="overview-bottom">
        <Panel
          title="Покрытие по типам"
          action={<LinkAction onClick={() => navigate('coverage')}>Все поля</LinkAction>}
        >
          <div className="type-bars">
            {byType.map((t) => (
              <button key={t.name} onClick={() => navigate('coverage', { search: t.name + '.' })}>
                <span>
                  <Code2 size={13} />
                  {t.name}
                </span>
                <div className="coverage-track">
                  <i style={{ width: (t.observed / t.total) * 100 + '%' }} />
                  <b style={{ width: (t.verified / t.total) * 100 + '%' }} />
                </div>
                <strong>{Math.round((t.observed / t.total) * 100)}%</strong>
              </button>
            ))}
          </div>
        </Panel>
        <Panel
          title="Последние операции"
          action={<LinkAction onClick={() => navigate('requests')}>Explorer</LinkAction>}
        >
          <div className="recent-list">
            {data.recent.slice(0, 5).map((r) => (
              <button key={r.id} onClick={() => navigate('requests', { search: r.operationName })}>
                <div className={`request-icon ${r.errors.length || r.status >= 400 ? 'failed' : ''}`}>
                  <GitBranch size={14} />
                </div>
                <div>
                  <strong>{r.operationName}</strong>
                  <span>
                    {r.fields.length} полей · {time(r.createdAt)}
                  </span>
                </div>
                <Badge tone={r.errors.length || r.status >= 400 ? 'red' : 'green'}>
                  {r.errors.length ? 'GQL error' : r.status}
                </Badge>
                <span>{Math.round(r.duration)} ms</span>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <div className="overview-bottom">
        <Panel
          title="Top GraphQL operations"
          action={<LinkAction onClick={() => navigate('requests')}>Исследовать</LinkAction>}
        >
          <div className="chart ranking-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.operations.slice(0, 6)}
                layout="vertical"
                margin={{ left: 4, right: 25, bottom: 10 }}
              >
                <CartesianGrid stroke="var(--line)" horizontal={false} />
                <XAxis type="number" {...axis} allowDecimals={false} />
                <YAxis type="category" dataKey="name" {...axis} width={125} fontSize={9} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="requests"
                  name="Запросы"
                  fill="#548678"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={12}
                  cursor="pointer"
                  onClick={(row: any) =>
                    navigate('requests', { search: row.name, fingerprint: row.fingerprint })
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="Чаще всего выбирают"
          action={<LinkAction onClick={() => navigate('coverage')}>Все поля</LinkAction>}
        >
          <div className="chart ranking-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...data.fields].sort((a, b) => b.observed - a.observed).slice(0, 6)}
                layout="vertical"
                margin={{ left: 4, right: 25, bottom: 10 }}
              >
                <CartesianGrid stroke="var(--line)" horizontal={false} />
                <XAxis type="number" {...axis} allowDecimals={false} />
                <YAxis type="category" dataKey="coordinate" {...axis} width={125} fontSize={9} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar
                  dataKey="observed"
                  name="Selections"
                  fill="#6489ab"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={12}
                  cursor="pointer"
                  onClick={(row: any) => navigate('coverage', { search: row.coordinate })}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
      <div className="overview-bottom three">
        <Panel title="Динамика coverage">
          <div className="chart small-chart">
            <ActivityChart data={data} kind="coverage" />
          </div>
        </Panel>
        <Panel title="Распределение latency">
          <div className="chart small-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.latencyDistribution} margin={{ left: -25, right: 5 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} />
                <XAxis dataKey="bucket" {...axis} fontSize={9} />
                <YAxis {...axis} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Запросы" fill="#6489ab" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Источники ошибок">
          <div className="error-breakdown">
            {data.errorBreakdown.map((e) => (
              <button key={e.name} onClick={() => navigate('requests', { errors: 'true' })}>
                <span>{e.name}</span>
                <b className={e.count ? 'color-red' : ''}>{e.count}</b>
              </button>
            ))}
          </div>
          <div className="chart tiny-chart">
            <ActivityChart data={data} kind="errors" />
          </div>
        </Panel>
      </div>
    </>
  );
}
