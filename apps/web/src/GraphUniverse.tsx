import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  type NodeProps,
  type Node,
  type Edge,
  type NodeChange,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from '@dagrejs/dagre';
import {
  Maximize2,
  RotateCcw,
  Network,
  ExternalLink,
  Layers,
  ChevronDown,
  Focus,
  CheckCheck,
} from 'lucide-react';
import type { Analytics, FieldStat } from '../../../packages/shared/src/index.js';
import { Badge, Button, FieldDot, Legend, SearchBox, Drawer } from './ui';
import { format, navigate } from './api';
type TypeData = {
  label: string;
  kind: string;
  fields: FieldStat[];
  compact: boolean;
  dim: boolean;
  highlight: boolean;
  activeFields: string[];
  recent: boolean;
  onField: (f: FieldStat) => void;
};
type TypeNode = Node<TypeData, 'schemaType'>;
type NodeMetadata = { measured?: { width: number; height: number }; position?: { x: number; y: number } };
function SchemaTypeNode({ data, selected }: NodeProps<TypeNode>) {
  const observed = data.fields.filter((f) => f.observed).length;
  const verified = data.fields.filter((f) => f.verified).length;
  return (
    <div
      className={`schema-node ${selected ? 'selected' : ''} ${data.dim ? 'dim' : ''} ${data.highlight ? 'highlight' : ''} ${data.recent ? 'recent-activity' : ''}`}
    >
      <Handle type="target" position={Position.Left} />
      <div className="schema-node-head">
        <div className="node-type-icon">
          <Layers size={14} />
        </div>
        <strong>{data.label}</strong>
        <span>
          {observed}/{data.fields.length}
        </span>
      </div>
      <div className="node-fields">
        {data.fields.slice(0, data.compact ? 3 : 6).map((f) => (
          <button
            className={`node-field ${data.activeFields.includes(f.coordinate) ? 'active-selection' : ''}`}
            key={f.coordinate}
            onClick={(e) => {
              e.stopPropagation();
              data.onField(f);
            }}
            title={`${f.coordinate} · ${f.type}`}
          >
            <FieldDot field={f} />
            <span>{f.name}</span>
            {f.verified && f.errors > 0 && <CheckCheck size={10} className="color-green" />}
            <small>{f.type}</small>
          </button>
        ))}
      </div>
      {data.fields.length > (data.compact ? 3 : 6) && (
        <div className="node-more">
          +{data.fields.length - (data.compact ? 3 : 6)} полей <ChevronDown size={11} />
        </div>
      )}
      <div className="node-coverage">
        <div style={{ width: `${data.fields.length ? (observed / data.fields.length) * 100 : 0}%` }} />
        <i style={{ width: `${data.fields.length ? (verified / data.fields.length) * 100 : 0}%` }} />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { schemaType: SchemaTypeNode };
const positions: Record<string, [number, number]> = {
  Query: [0, 260],
  Mutation: [0, 640],
  Product: [350, 120],
  User: [350, 470],
  Order: [700, 290],
  Category: [700, 0],
  Inventory: [700, 620],
  Supplier: [1050, 0],
  Review: [1050, 300],
  OrderItem: [1050, 620],
  Payment: [1400, 180],
  Shipment: [1400, 480],
  Notification: [700, 940],
  AnalyticsSummary: [350, 920],
  Node: [0, 950],
  SearchResult: [1400, 820],
};
function GraphCanvas({
  data,
  compact = false,
  operationFields = [],
}: {
  data: Analytics;
  compact?: boolean;
  operationFields?: string[];
}) {
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<string | null>(null),
    [field, setField] = useState<FieldStat | null>(null);
  const [layoutKey, setLayoutKey] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const flow = useReactFlow();
  const [autoLayout, setAutoLayout] = useState(false);
  const [nodeMetadata, setNodeMetadata] = useState<Record<string, NodeMetadata>>({});
  const onNodesChange = useCallback((changes: NodeChange<TypeNode>[]) => {
    setNodeMetadata((previous) => {
      let next = previous;
      for (const change of changes) {
        if (change.type === 'dimensions' && change.dimensions) {
          const old = next[change.id]?.measured;
          if (old?.width !== change.dimensions.width || old?.height !== change.dimensions.height) {
            if (next === previous) next = { ...previous };
            next[change.id] = { ...next[change.id], measured: change.dimensions };
          }
        }
        if (change.type === 'position' && change.position) {
          const old = next[change.id]?.position;
          if (old?.x !== change.position.x || old?.y !== change.position.y) {
            if (next === previous) next = { ...previous };
            next[change.id] = { ...next[change.id], position: change.position };
          }
        }
      }
      return next;
    });
  }, []);
  const clearDraggedPositions = useCallback(
    () =>
      setNodeMetadata((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, metadata]) => [id, { measured: metadata.measured }]),
        ),
      ),
    [],
  );
  const [recentFields, setRecentFields] = useState<string[]>([]);
  const lastEvent = data.recent[0];
  useEffect(() => {
    if (!lastEvent || Date.now() - new Date(lastEvent.createdAt).getTime() > 2500) return;
    setRecentFields(lastEvent.fields);
    const timer = setTimeout(() => setRecentFields([]), 1800);
    return () => clearTimeout(timer);
  }, [lastEvent?.id]);
  const visibleTypes = useMemo(
    () =>
      compact
        ? data.schema.types.filter((t) =>
            ['Query', 'Product', 'User', 'Order', 'Payment', 'Inventory', 'Category'].includes(t.name),
          ).length >= 4
          ? data.schema.types.filter((t) =>
              ['Query', 'Product', 'User', 'Order', 'Payment', 'Inventory', 'Category'].includes(t.name),
            )
          : data.schema.types.slice(0, 7)
        : data.schema.types,
    [data.schema.types, compact],
  );
  const compactPositions: Record<string, [number, number]> = {
    Query: [0, 145],
    Product: [260, 0],
    User: [260, 270],
    Order: [520, 170],
    Inventory: [520, -80],
    Payment: [780, 280],
    Category: [780, 0],
  };
  const onField = useCallback((f: FieldStat) => setField(f), []);
  const related = useMemo(() => {
    if (!selected) return new Set<string>();
    const connected = new Set([selected]);
    data.fields.forEach((f) => {
      if (f.typeName === selected) connected.add(f.target);
      if (f.target === selected) connected.add(f.typeName);
    });
    return connected;
  }, [selected, data.fields]);
  const nodes = useMemo<TypeNode[]>(
    () =>
      visibleTypes.map((type, i) => {
        const fields = data.fields.filter((f) => f.typeName === type.name);
        const matches =
          !search ||
          type.name.toLowerCase().includes(search.toLowerCase()) ||
          fields.some((f) => f.name.toLowerCase().includes(search.toLowerCase()));
        const status =
          filter === 'all' ||
          fields.some((f) =>
            filter === 'verified'
              ? f.verified
              : filter === 'observed'
                ? f.observed
                : filter === 'errors'
                  ? f.errors
                  : !f.observed,
          );
        const pos = (compact ? compactPositions[type.name] : positions[type.name]) || [
          (i % 4) * 350,
          Math.floor(i / 4) * 320,
        ];
        return {
          id: type.name,
          type: 'schemaType',
          position: { x: pos[0], y: pos[1] },
          selected: type.name === selected,
          data: {
            label: type.name,
            kind: type.kind,
            fields,
            compact,
            dim: !matches || !status || (selected !== null && !related.has(type.name)),
            highlight:
              operationFields.length > 0 && fields.some((f) => operationFields.includes(f.coordinate)),
            activeFields: operationFields,
            recent: fields.some((f) => recentFields.includes(f.coordinate)),
            onField,
          },
        };
      }),
    [
      visibleTypes,
      data.fields,
      search,
      filter,
      selected,
      related,
      compact,
      operationFields,
      onField,
      recentFields,
    ],
  );
  const edges = useMemo<Edge[]>(() => {
    const names = new Set(visibleTypes.map((t) => t.name));
    const fieldEdges: Edge[] = data.fields
      .filter((f) => names.has(f.typeName) && names.has(f.target) && f.target !== f.typeName)
      .map((f) => ({
        id: f.coordinate,
        source: f.typeName,
        target: f.target,
        animated: operationFields.includes(f.coordinate) || recentFields.includes(f.coordinate),
        style: {
          stroke: f.errors ? '#f4778d' : f.verified ? '#43d9b1' : f.observed ? '#7194fc' : '#303c53',
          strokeWidth: selected && (f.typeName === selected || f.target === selected) ? 2.5 : 1,
          opacity: selected && !related.has(f.typeName) ? 0.08 : 0.55,
        },
        label: !compact && selected === f.typeName ? f.name : undefined,
        labelStyle: { fill: '#9ba9c3', fontSize: 10 },
      }));
    const abstractEdges: Edge[] = visibleTypes.flatMap((t) =>
      (t.possibleTypes || [])
        .filter((name) => names.has(name))
        .map((name) => ({
          id: `abstract:${t.name}:${name}`,
          source: t.name,
          target: name,
          style: { stroke: '#716b9c', strokeDasharray: '5 5', opacity: 0.35 },
          label: !compact && selected === t.name ? t.kind : undefined,
          labelStyle: { fill: '#9b91bb', fontSize: 10 },
        })),
    );
    return [...fieldEdges, ...abstractEdges];
  }, [data.fields, visibleTypes, operationFields, compact, selected, related, recentFields]);
  const laidOutNodes = useMemo(() => {
    if (!autoLayout) return nodes;
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 95, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(() => ({}));
    nodes.forEach((n) => g.setNode(n.id, { width: compact ? 190 : 246, height: compact ? 165 : 245 }));
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    return nodes.map((n) => {
      const p = g.node(n.id);
      return { ...n, position: { x: p.x - (compact ? 95 : 123), y: p.y - (compact ? 82 : 122) } };
    });
  }, [nodes, edges, autoLayout, compact, layoutKey]);
  const renderedNodes = useMemo(
    () =>
      laidOutNodes.map((node) => ({
        ...node,
        measured: nodeMetadata[node.id]?.measured,
        position: nodeMetadata[node.id]?.position || node.position,
      })),
    [laidOutNodes, nodeMetadata],
  );
  useEffect(() => {
    const timer = setTimeout(() => flow.fitView({ padding: 0.12, duration: 350 }), 80);
    return () => clearTimeout(timer);
  }, [layoutKey, compact]);
  return (
    <div className={`graph-shell ${compact ? 'compact' : ''}`} ref={container}>
      <div className="graph-tools">
        <SearchBox value={search} onChange={setSearch} placeholder="Найти тип или поле…" />
        {!compact && (
          <select aria-label="Статус полей графа" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Все статусы</option>
            <option value="verified">Verified</option>
            <option value="observed">Observed</option>
            <option value="unseen">Unobserved</option>
            <option value="errors">Errors</option>
          </select>
        )}
        <div className="graph-tool-right">
          <Button
            small
            variant="ghost"
            title="Автокомпоновка"
            onClick={() => {
              setAutoLayout(true);
              clearDraggedPositions();
              setLayoutKey((k) => k + 1);
              setSelected(null);
            }}
          >
            <Network size={15} />
          </Button>
          <Button
            small
            variant="ghost"
            title="Reset View"
            onClick={() => {
              setSearch('');
              setFilter('all');
              setSelected(null);
              setAutoLayout(false);
              clearDraggedPositions();
              setLayoutKey((k) => k + 1);
            }}
          >
            <RotateCcw size={15} />
          </Button>
          <Button
            small
            variant="ghost"
            title="На весь экран"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else container.current?.requestFullscreen();
            }}
          >
            <Maximize2 size={15} />
          </Button>
        </div>
      </div>
      <ReactFlow
        nodes={renderedNodes}
        onNodesChange={onNodesChange}
        deleteKeyCode={null}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        minZoom={0.15}
        maxZoom={2}
        onNodeClick={(_, node) => {
          setSelected(node.id);
          if (!compact) flow.fitView({ nodes: [node], padding: 1.3, duration: 450, maxZoom: 0.9 });
        }}
        onPaneClick={() => setSelected(null)}
        colorMode="light"
      >
        <Background color="var(--line)" variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls showInteractive={false} />
        {!compact && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) =>
              (n.data as TypeData).fields.some((f) => f.verified)
                ? '#43d9b1'
                : (n.data as TypeData).fields.some((f) => f.observed)
                  ? '#7194fc'
                  : '#3c465d'
            }
            maskColor="rgba(135,150,160,.15)"
          />
        )}
      </ReactFlow>
      <div className="graph-footer">
        <Legend />
        <span>
          {compact ? `${visibleTypes.length}/${data.schema.types.length}` : data.schema.types.length} типов ·{' '}
          {data.fields.length} полей
          {compact && (
            <button onClick={() => navigate('graph')}>
              Открыть Universe <ExternalLink size={12} />
            </button>
          )}
        </span>
      </div>
      {selected && !compact && (
        <div className="graph-type-panel">
          <div className="flex-between">
            <strong>
              <Focus size={14} /> {selected}
            </strong>
            <button className="text-button" onClick={() => setSelected(null)}>
              Сбросить
            </button>
          </div>
          <p className="muted">Связанные типы подсвечены. Выберите поле для деталей.</p>
          <div>
            {data.fields
              .filter((f) => f.typeName === selected)
              .map((f) => (
                <button key={f.coordinate} onClick={() => setField(f)}>
                  <FieldDot field={f} />
                  <code>{f.name}</code>
                  <span>{f.observed} req</span>
                </button>
              ))}
          </div>
        </div>
      )}
      {field && (
        <Drawer title={field.coordinate} onClose={() => setField(null)}>
          <div className="detail-label">SCHEMA FIELD</div>
          <h2>{field.type}</h2>
          <div className="detail-grid">
            <div>
              Наблюдения<strong>{format(field.observed)}</strong>
            </div>
            <div>
              Ошибочные операции<strong>{field.errors}</strong>
            </div>
            <div>
              Тесты<strong>{field.testIds.length}</strong>
            </div>
            <div>
              Риск<strong>{field.risk}/100</strong>
            </div>
          </div>
          <Badge tone={field.verified ? 'green' : field.observed ? 'blue' : 'neutral'}>
            {field.verified
              ? 'Подтверждено assertions'
              : field.observed
                ? 'Выбрано в наблюдаемых операциях'
                : 'Пока не наблюдалось'}
          </Badge>
          <p className="explanation">
            {field.verified
              ? 'Поле присутствует на пути успешной проверки зарегистрированного теста.'
              : field.reasons.join('. ')}{' '}
            Селекция не доказывает выполнение resolver.
          </p>
          {field.deprecated && <div className="error-box">Deprecated: {field.deprecated}</div>}
          <Button onClick={() => navigate('requests', { field: field.coordinate })}>
            Связанные запросы <ExternalLink size={15} />
          </Button>
        </Drawer>
      )}
    </div>
  );
}
export function GraphUniverse(props: { data: Analytics; compact?: boolean; operationFields?: string[] }) {
  return (
    <ReactFlowProvider>
      <GraphCanvas {...props} />
    </ReactFlowProvider>
  );
}
