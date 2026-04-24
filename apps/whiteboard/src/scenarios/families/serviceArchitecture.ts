import type { Edge, Node } from '@whiteboard/core/types'
import {
  createScenarioDocumentBuilder,
  type ScenarioDocumentBuilder
} from '@whiteboard/demo/scenarios/builder'
import {
  cycle,
  createSeededRandom,
  allocateCounts,
  distributeEvenly
} from '@whiteboard/demo/scenarios/support'
import type {
  GeneratedScenarioFamily,
  ScenarioContext
} from '@whiteboard/demo/scenarios/types'
import { SCENARIO_SIZES } from '@whiteboard/demo/scenarios/sizes'

type ServiceDomainCounts = {
  gateway: number
  service: number
  worker: number
  database: number
  cache: number
  stream: number
  external: number
  dashboard: number
  note: number
}

type ServiceDomain = {
  name: string
  frameColor: string
  counts: ServiceDomainCounts
}

type ServiceDomainGraph = {
  frame: Node
  gateways: Node[]
  services: Node[]
  workers: Node[]
  databases: Node[]
  caches: Node[]
  streams: Node[]
  externals: Node[]
  dashboards: Node[]
  notes: Node[]
}

const DOMAIN_NAMES = [
  'Identity',
  'Order',
  'Billing',
  'Search',
  'Workspace',
  'Feed',
  'Notification',
  'Analytics',
  'Growth',
  'Comments'
] as const

const FRAME_COLORS = [
  '#e0f2fe',
  '#dcfce7',
  '#fef3c7',
  '#ede9fe',
  '#fde68a',
  '#fce7f3',
  '#dbeafe',
  '#fee2e2',
  '#cffafe',
  '#e9d5ff'
] as const

const FRAME_STROKES = [
  '#0284c7',
  '#15803d',
  '#d97706',
  '#7c3aed',
  '#b45309',
  '#be185d',
  '#2563eb',
  '#dc2626',
  '#0891b2',
  '#9333ea'
] as const

const SERVICE_PREFIXES = [
  'Gateway',
  'Policy',
  'Index',
  'Catalog',
  'Rules',
  'Replica',
  'Projection',
  'Realtime',
  'Sync',
  'Search'
] as const

const SERVICE_SUFFIXES = [
  'API',
  'Service',
  'Coordinator',
  'Resolver',
  'Manager',
  'Engine',
  'Planner',
  'Processor'
] as const

const WORKER_NAMES = [
  'Ingest Worker',
  'Rebuild Worker',
  'Retry Worker',
  'Backfill Worker',
  'Projection Worker',
  'Replay Consumer',
  'Snapshot Worker',
  'Drain Worker'
] as const

const DATABASE_NAMES = [
  'Primary Store',
  'Replica Store',
  'Search Index',
  'Audit Store',
  'Metadata Store',
  'Blob Store'
] as const

const CACHE_NAMES = [
  'Result Cache',
  'Session Cache',
  'Edge Cache',
  'Layout Cache',
  'Read Cache',
  'Auth Cache'
] as const

const STREAM_NAMES = [
  'Domain Events',
  'Replay Stream',
  'Command Queue',
  'Projection Stream',
  'Retry Queue',
  'Webhook Queue'
] as const

const EXTERNAL_NAMES = [
  'Stripe',
  'GitHub',
  'Slack',
  'Zendesk',
  'Salesforce',
  'PagerDuty'
] as const

const DASHBOARD_NAMES = [
  'Latency Dashboard',
  'Ops Runbook',
  'SLO Board',
  'Error Budget',
  'Incident Drill',
  'Capacity Review'
] as const

const NOTE_LINES = [
  'Runbook: backfill queue before cutover',
  'Migration note: dual write only during replay',
  'Alert: isolate hot shard before rollout',
  'Constraint: auth cache cannot lag session revoke',
  'Decision: keep edge routing in gateway layer',
  'Risk: replica sync drifts under burst traffic'
] as const

const domainCountBySize = (
  size: ScenarioContext['size']
) => {
  switch (size) {
    case 100:
      return 4
    case 500:
      return 6
    case 1000:
      return 8
    case 2000:
      return 10
  }
}

const bandColumnsBySize = (
  size: ScenarioContext['size']
) => {
  switch (size) {
    case 100:
      return 3
    case 500:
      return 4
    case 1000:
      return 5
    case 2000:
      return 6
  }
}

const createDomainDefinitions = (
  context: ScenarioContext
): ServiceDomain[] => {
  const domainCount = domainCountBySize(context.size)
  const budgets = distributeEvenly(context.budget.contentNodes, domainCount)

  return budgets.map((budget, index) => ({
    name: cycle(DOMAIN_NAMES, index),
    frameColor: cycle(FRAME_COLORS, index),
    counts: allocateCounts(budget, [
      { key: 'gateway', min: 2, weight: 1.2 },
      { key: 'service', min: 6, weight: 3.2 },
      { key: 'worker', min: 3, weight: 1.5 },
      { key: 'database', min: 2, weight: 1.1 },
      { key: 'cache', min: 2, weight: 0.9 },
      { key: 'stream', min: 2, weight: 1.0 },
      { key: 'external', min: 1, weight: 0.55 },
      { key: 'dashboard', min: 1, weight: 0.45 },
      { key: 'note', min: 1, weight: 0.55 }
    ])
  }))
}

const createServiceLabel = (
  domain: string,
  index: number
) => `${domain} ${cycle(SERVICE_PREFIXES, index)} ${cycle(SERVICE_SUFFIXES, index + 2)}`

const pushPlacedNode = (
  items: Node[],
  node: Node
) => {
  items.push(node)
  return node
}

const placeBandNodes = ({
  builder,
  target,
  frame,
  top,
  count,
  columns,
  width,
  height,
  gapX,
  gapY,
  createNode
}: {
  builder: ScenarioDocumentBuilder
  target: Node[]
  frame: Node
  top: number
  count: number
  columns: number
  width: number
  height: number
  gapX: number
  gapY: number
  createNode: (position: { x: number; y: number }, index: number) => Node
}) => {
  const frameX = frame.position.x
  const usableWidth = frame.size!.width - 64
  const cellWidth = Math.min(
    width + gapX,
    Math.max(width, Math.floor((usableWidth - (columns - 1) * gapX) / columns))
  )

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns)
    const col = index % columns
    const position = {
      x: frameX + 32 + col * cellWidth,
      y: top + row * (height + gapY)
    }
    pushPlacedNode(target, createNode(position, index))
  }
}

const linkUnique = (
  builder: ScenarioDocumentBuilder,
  source: Node | undefined,
  target: Node | undefined,
  style: Edge['style'] | undefined,
  seen: Set<string>
) => {
  if (!source || !target || source.id === target.id) {
    return false
  }

  const key = `${source.id}->${target.id}`
  if (seen.has(key)) {
    return false
  }

  seen.add(key)
  builder.addEdge({
    sourceNodeId: source.id,
    targetNodeId: target.id,
    style
  })
  return true
}

const buildDomainGraph = (
  builder: ScenarioDocumentBuilder,
  context: ScenarioContext,
  domain: ServiceDomain,
  domainIndex: number,
  frame: Node,
  bandColumns: number,
  bandTops: {
    ingress: number
    service: number
    async: number
    data: number
    note: number
  }
): ServiceDomainGraph => {
  const rng = createSeededRandom(`${context.seed}:${domain.name}`)
  const stroke = cycle(FRAME_STROKES, domainIndex)
  const graph: ServiceDomainGraph = {
    frame,
    gateways: [],
    services: [],
    workers: [],
    databases: [],
    caches: [],
    streams: [],
    externals: [],
    dashboards: [],
    notes: []
  }

  placeBandNodes({
    builder,
    target: graph.gateways,
    frame,
    top: bandTops.ingress,
    count: domain.counts.gateway,
    columns: bandColumns,
    width: 150,
    height: 72,
    gapX: 18,
    gapY: 18,
    createNode: (position, index) => builder.addShape({
      position: {
        x: rng.jitter(position.x, 6),
        y: rng.jitter(position.y, 4)
      },
      size: { width: 150, height: 72 },
      kind: 'pill',
      text: `${domain.name} ${cycle(['Gateway', 'Ingress', 'Edge', 'Public API'], index)}`,
      style: {
        fill: '#ffffff',
        stroke,
        color: '#0f172a',
        strokeWidth: 2
      }
    })
  })

  placeBandNodes({
    builder,
    target: graph.externals,
    frame,
    top: bandTops.ingress,
    count: domain.counts.external,
    columns: bandColumns,
    width: 168,
    height: 96,
    gapX: 18,
    gapY: 18,
    createNode: (position, index) => builder.addShape({
      position: {
        x: rng.jitter(position.x, 8),
        y: rng.jitter(position.y + 88, 6)
      },
      size: { width: 168, height: 96 },
      kind: 'cloud',
      text: `${cycle(EXTERNAL_NAMES, domainIndex + index)} API`,
      style: {
        fill: '#ffffff',
        stroke,
        strokeWidth: 1.5,
        color: '#0f172a'
      }
    })
  })

  placeBandNodes({
    builder,
    target: graph.services,
    frame,
    top: bandTops.service,
    count: domain.counts.service,
    columns: bandColumns,
    width: 152,
    height: 88,
    gapX: 18,
    gapY: 18,
    createNode: (position, index) => builder.addShape({
      position: {
        x: rng.jitter(position.x, 7),
        y: rng.jitter(position.y, 5)
      },
      size: { width: 152, height: 88 },
      kind: 'rect',
      text: createServiceLabel(domain.name, index + domainIndex),
      style: {
        fill: '#ffffff',
        stroke,
        strokeWidth: 1.6,
        color: '#0f172a'
      }
    })
  })

  placeBandNodes({
    builder,
    target: graph.workers,
    frame,
    top: bandTops.async,
    count: domain.counts.worker,
    columns: bandColumns,
    width: 152,
    height: 84,
    gapX: 18,
    gapY: 18,
    createNode: (position, index) => builder.addShape({
      position: {
        x: rng.jitter(position.x, 7),
        y: rng.jitter(position.y, 5)
      },
      size: { width: 152, height: 84 },
      kind: 'predefined-process',
      text: `${domain.name} ${cycle(WORKER_NAMES, index + domainIndex)}`,
      style: {
        fill: '#f8fafc',
        stroke,
        strokeWidth: 1.4,
        color: '#0f172a'
      }
    })
  })

  placeBandNodes({
    builder,
    target: graph.streams,
    frame,
    top: bandTops.async,
    count: domain.counts.stream,
    columns: bandColumns,
    width: 160,
    height: 84,
    gapX: 18,
    gapY: 18,
    createNode: (position, index) => builder.addShape({
      position: {
        x: rng.jitter(position.x, 7),
        y: rng.jitter(position.y + 98, 5)
      },
      size: { width: 160, height: 84 },
      kind: 'parallelogram',
      text: `${domain.name} ${cycle(STREAM_NAMES, index + domainIndex)}`,
      style: {
        fill: '#ffffff',
        stroke,
        strokeWidth: 1.4,
        color: '#0f172a'
      }
    })
  })

  placeBandNodes({
    builder,
    target: graph.databases,
    frame,
    top: bandTops.data,
    count: domain.counts.database,
    columns: bandColumns,
    width: 160,
    height: 106,
    gapX: 18,
    gapY: 18,
    createNode: (position, index) => builder.addShape({
      position: {
        x: rng.jitter(position.x, 8),
        y: rng.jitter(position.y, 5)
      },
      size: { width: 160, height: 106 },
      kind: 'cylinder',
      text: `${domain.name} ${cycle(DATABASE_NAMES, index)}`,
      style: {
        fill: '#ffffff',
        stroke,
        strokeWidth: 1.4,
        color: '#0f172a'
      }
    })
  })

  placeBandNodes({
    builder,
    target: graph.caches,
    frame,
    top: bandTops.data,
    count: domain.counts.cache,
    columns: bandColumns,
    width: 150,
    height: 84,
    gapX: 18,
    gapY: 18,
    createNode: (position, index) => builder.addShape({
      position: {
        x: rng.jitter(position.x, 8),
        y: rng.jitter(position.y + 118, 5)
      },
      size: { width: 150, height: 84 },
      kind: 'rounded-rect',
      text: `${domain.name} ${cycle(CACHE_NAMES, index + domainIndex)}`,
      style: {
        fill: '#ffffff',
        stroke,
        strokeWidth: 1.4,
        color: '#0f172a'
      }
    })
  })

  placeBandNodes({
    builder,
    target: graph.dashboards,
    frame,
    top: bandTops.data,
    count: domain.counts.dashboard,
    columns: bandColumns,
    width: 160,
    height: 92,
    gapX: 18,
    gapY: 18,
    createNode: (position, index) => builder.addShape({
      position: {
        x: rng.jitter(position.x, 8),
        y: rng.jitter(position.y + 214, 5)
      },
      size: { width: 160, height: 92 },
      kind: 'document',
      text: cycle(DASHBOARD_NAMES, index + domainIndex),
      style: {
        fill: '#ffffff',
        stroke,
        strokeWidth: 1.3,
        color: '#0f172a'
      }
    })
  })

  for (let index = 0; index < domain.counts.note; index += 1) {
    const row = Math.floor(index / bandColumns)
    const col = index % bandColumns
    const baseX = frame.position.x + 32 + col * 170
    const baseY = bandTops.note + row * 124
    const noteText = cycle(NOTE_LINES, index + domainIndex)
    if (index % 2 === 0) {
      graph.notes.push(builder.addSticky({
        position: {
          x: rng.jitter(baseX, 6),
          y: rng.jitter(baseY, 5)
        },
        size: { width: 178, height: 112 },
        text: noteText,
        style: {
          fill: '#fff7cc'
        }
      }))
    } else {
      graph.notes.push(builder.addText({
        position: {
          x: rng.jitter(baseX, 6),
          y: rng.jitter(baseY + 24, 5)
        },
        size: { width: 210, height: 56 },
        text: noteText,
        style: {
          fontSize: 14,
          color: '#334155'
        }
      }))
    }
  }

  return graph
}

const createEdges = (
  builder: ScenarioDocumentBuilder,
  context: ScenarioContext,
  domains: ServiceDomainGraph[]
) => {
  const seen = new Set<string>()
  const edgeColor = '#64748b'

  domains.forEach((domain, domainIndex) => {
    domain.gateways.forEach((gateway, index) => {
      linkUnique(builder, gateway, domain.services[index % domain.services.length], { color: edgeColor }, seen)
      linkUnique(builder, gateway, domain.services[(index + 1) % domain.services.length], { color: edgeColor }, seen)
    })

    domain.externals.forEach((external, index) => {
      linkUnique(
        builder,
        external,
        domain.gateways[index % domain.gateways.length] ?? domain.services[index % domain.services.length],
        { color: edgeColor },
        seen
      )
    })

    domain.services.forEach((service, index) => {
      linkUnique(builder, service, domain.databases[index % domain.databases.length], { color: edgeColor }, seen)
      linkUnique(builder, service, domain.streams[index % domain.streams.length], { color: edgeColor }, seen)
      linkUnique(builder, service, domain.caches[index % domain.caches.length], { color: edgeColor }, seen)
    })

    domain.workers.forEach((worker, index) => {
      linkUnique(builder, worker, domain.streams[index % domain.streams.length], { color: edgeColor }, seen)
      linkUnique(builder, worker, domain.databases[(index + 1) % domain.databases.length], { color: edgeColor }, seen)
    })

    domain.dashboards.forEach((dashboard, index) => {
      linkUnique(builder, dashboard, domain.services[index % domain.services.length], { color: edgeColor }, seen)
    })

    domain.notes.forEach((note, index) => {
      linkUnique(builder, note, domain.services[index % domain.services.length], { color: edgeColor }, seen)
    })

    const next = domains[(domainIndex + 1) % domains.length]
    domain.gateways.forEach((gateway, index) => {
      linkUnique(builder, gateway, next.services[index % next.services.length], { color: edgeColor }, seen)
    })
  })

  const targetEdges = Math.ceil(context.budget.contentNodes * 0.95)
  const services = domains.flatMap((domain) => domain.services)
  const gateways = domains.flatMap((domain) => domain.gateways)
  const workers = domains.flatMap((domain) => domain.workers)
  let cursor = 0
  while (seen.size < targetEdges) {
    const source = services[cursor % services.length]
    const target = gateways[(cursor * 3 + 1) % gateways.length] ?? workers[(cursor * 5 + 2) % workers.length]
    linkUnique(builder, source, target, { color: edgeColor }, seen)
    cursor += 1
    if (cursor > targetEdges * 4) {
      break
    }
  }
}

const createDocument = (
  context: ScenarioContext
) => {
  const builder = createScenarioDocumentBuilder()
  const domains = createDomainDefinitions(context)
  const bandColumns = bandColumnsBySize(context.size)
  const maxRows = domains.reduce((acc, domain) => ({
    ingress: Math.max(acc.ingress, Math.ceil((domain.counts.gateway + domain.counts.external) / bandColumns)),
    service: Math.max(acc.service, Math.ceil(domain.counts.service / bandColumns)),
    async: Math.max(acc.async, Math.ceil((domain.counts.worker + domain.counts.stream) / bandColumns)),
    data: Math.max(acc.data, Math.ceil((domain.counts.database + domain.counts.cache + domain.counts.dashboard) / bandColumns)),
    note: Math.max(acc.note, Math.ceil(domain.counts.note / bandColumns))
  }), {
    ingress: 1,
    service: 1,
    async: 1,
    data: 1,
    note: 1
  })

  const frameWidth = 64 + bandColumns * 168
  const frameHeight =
    96
    + maxRows.ingress * 204
    + maxRows.service * 106
    + maxRows.async * 204
    + maxRows.data * 320
    + maxRows.note * 128
    + 72
  const frameColumns = domains.length <= 4 ? 2 : domains.length <= 6 ? 3 : 4
  const frameGapX = 140
  const frameGapY = 160
  const totalWidth = frameColumns * frameWidth + (frameColumns - 1) * frameGapX
  const bandTops = {
    ingress: 72,
    service: 72 + maxRows.ingress * 204,
    async: 72 + maxRows.ingress * 204 + maxRows.service * 106,
    data: 72 + maxRows.ingress * 204 + maxRows.service * 106 + maxRows.async * 204,
    note: 72 + maxRows.ingress * 204 + maxRows.service * 106 + maxRows.async * 204 + maxRows.data * 320
  }

  const graphs = domains.map((domain, index) => {
    const row = Math.floor(index / frameColumns)
    const col = index % frameColumns
    const position = {
      x: col * (frameWidth + frameGapX) - totalWidth / 2,
      y: row * (frameHeight + frameGapY) - 180
    }
    const stroke = cycle(FRAME_STROKES, index)
    const frame = builder.addFrame({
      position,
      size: { width: frameWidth, height: frameHeight },
      title: `${domain.name} Domain`,
      style: {
        fill: domain.frameColor,
        stroke,
        strokeWidth: 2,
        color: '#0f172a'
      }
    })

    return buildDomainGraph(
      builder,
      context,
      domain,
      index,
      frame,
      bandColumns,
      {
        ingress: position.y + bandTops.ingress,
        service: position.y + bandTops.service,
        async: position.y + bandTops.async,
        data: position.y + bandTops.data,
        note: position.y + bandTops.note
      }
    )
  })

  createEdges(builder, context, graphs)
  return builder.build(`demo-${context.familyId}-${context.size}`)
}

export const serviceArchitectureFamily: GeneratedScenarioFamily = {
  id: 'service-architecture',
  label: '服务架构',
  description: '按领域分 frame 的系统拓扑与依赖流。',
  sizes: SCENARIO_SIZES,
  create: createDocument
}

