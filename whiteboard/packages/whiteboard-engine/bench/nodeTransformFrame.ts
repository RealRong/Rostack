import { viewportScreenToWorld } from '@whiteboard/core/geometry'
import {
  type Document,
  type Edge,
  type Node,
  type Point,
  type Viewport
} from '@whiteboard/core/types'
import { createEngine } from '../src/instance/engine'
import type { PointerInput } from '@engine-types/common/input'
import type { NodeTransformUpdateConstraints } from '@engine-types/node/transform'
import { NodeTransformKernel } from './kernels/nodeTransform/Kernel'

const NODE_COUNT = 5000
const EDGE_COUNT = 10000
const GRID_COLS = 100
const RUNS = 5
const WARMUP_FRAMES = 80
const MEASURE_FRAMES = 240
const runtime = globalThis as {
  process?: {
    env?: Record<string, string | undefined>
    exitCode?: number
  }
}

const env = runtime.process?.env ?? {}

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const FRAME_BUDGET_MS = toNumber(
  env.WB_BENCH_TRANSFORM_FRAME_BUDGET_MS ?? env.WB_BENCH_FRAME_BUDGET_MS,
  4
)
const ENFORCE_THRESHOLD = env.WB_BENCH_ENFORCE === '1'
const BENCH_VIEWPORT: Viewport = {
  center: { x: 0, y: 0 },
  zoom: 1
}

const now = () =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

const cloneDoc = <T,>(value: T): T => {
  const structuredCloneFn = (
    globalThis as { structuredClone?: <V>(input: V) => V }
  ).structuredClone
  if (structuredCloneFn) {
    return structuredCloneFn(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

const ensureRaf = () => {
  const runtimeRef = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: (timestamp: number) => void) => number
    cancelAnimationFrame?: (id: number) => void
  }
  if (typeof runtimeRef.requestAnimationFrame === 'function') return
  runtimeRef.requestAnimationFrame = (callback) => {
    callback(now())
    return 0
  }
  runtimeRef.cancelAnimationFrame = () => {}
}

const toEntities = <T extends { id: string }>(items: T[]) =>
  Object.fromEntries(items.map((item) => [item.id, item])) as Record<string, T>

const createNodes = (): Node[] => {
  const nodes: Node[] = []
  for (let index = 0; index < NODE_COUNT; index += 1) {
    const row = Math.floor(index / GRID_COLS)
    const col = index % GRID_COLS
    nodes.push({
      id: `n_${index}`,
      type: 'card',
      position: {
        x: col * 180,
        y: row * 120
      },
      size: {
        width: 140,
        height: 80
      }
    })
  }
  return nodes
}

const createEdges = (): Edge[] => {
  const edges: Edge[] = []
  for (let index = 0; index < EDGE_COUNT; index += 1) {
    const sourceIndex = index % NODE_COUNT
    const targetIndex = (index * 7 + 13) % NODE_COUNT
    edges.push({
      id: `e_${index}`,
      type: 'linear',
      source: { nodeId: `n_${sourceIndex}` },
      target: {
        nodeId: `n_${targetIndex === sourceIndex ? (targetIndex + 1) % NODE_COUNT : targetIndex}`
      }
    })
  }
  return edges
}

const toCollection = <T extends { id: string }>(items: T[]) => ({
  entities: Object.fromEntries(items.map((item) => [item.id, item])),
  order: items.map((item) => item.id)
})

const createDocument = (): Document => {
  const nodes = createNodes()
  const edges = createEdges()
  return {
    id: 'bench-doc-transform',
    name: 'node-transform-frame-bench',
    nodes: toCollection(nodes),
    edges: toCollection(edges)
  }
}

const percentile = (values: number[], p: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  )
  return sorted[index] ?? 0
}

const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0

const format = (value: number) => `${value.toFixed(4)}ms`

const createPointerInput = (options: {
  viewport: Viewport
  pointerId: number
  client: Point
}): PointerInput => {
  const { viewport, pointerId, client } = options
  const screen = {
    x: client.x,
    y: client.y
  }
  return {
    pointerId,
    button: 0,
    client,
    screen,
    world: viewportScreenToWorld(screen, viewport, { x: 0, y: 0 }),
    modifiers: {
      shift: false,
      alt: false,
      ctrl: false,
      meta: false
    }
  }
}

const TRANSFORM_CONSTRAINTS: NodeTransformUpdateConstraints = {
  resize: {
    keepAspect: false,
    fromCenter: false,
    snapEnabled: true
  },
  rotate: {
    snapToStep: false
  }
}

const main = () => {
  ensureRaf()

  let doc = createDocument()
  const viewport = BENCH_VIEWPORT
  const instance = createEngine({
    document: doc,
    onDocumentChange: (nextDoc) => {
      doc = nextDoc
    }
  })
  const transformKernel = new NodeTransformKernel({
    instance: {
      read: instance.read,
      viewport: {
        get: () => viewport
      },
      config: instance.config,
      document: {
        get: () => doc
      }
    }
  })
  const syncDoc = (next: Document) => {
    doc = next
    void instance.commands.document.replace(next)
  }

  const nodeId = `n_${Math.floor(NODE_COUNT / 2)}`
  const baseNode = instance.read.index.node.get(nodeId)?.node
  if (!baseNode) {
    throw new Error(`Missing transform node: ${nodeId}`)
  }
  const basePosition = {
    x: baseNode.position.x,
    y: baseNode.position.y
  }
  const baseSize = {
    width: baseNode.size?.width ?? 140,
    height: baseNode.size?.height ?? 80
  }

  const runSamples: number[][] = []
  for (let run = 0; run < RUNS; run += 1) {
    const pointerId = run + 1
    const nodeRect = instance.read.index.node.get(nodeId)
    if (!nodeRect) {
      throw new Error(`Missing nodeRect for node ${nodeId} at run ${run + 1}`)
    }
    const startClient = {
      x: basePosition.x + baseSize.width,
      y: basePosition.y + baseSize.height
    }
    const draft = transformKernel.beginResize({
      nodeId,
      pointer: createPointerInput({
        viewport,
        pointerId,
        client: startClient
      }),
      handle: 'se',
      rect: nodeRect.rect,
      rotation: nodeRect.rotation
    })
    if (!draft) {
      throw new Error(`nodeTransform.beginResize failed at run ${run + 1}`)
    }

    for (let frame = 0; frame < WARMUP_FRAMES; frame += 1) {
      const client = {
        x: startClient.x + frame * 0.8,
        y: startClient.y + frame * 0.5 + Math.sin(frame / 10) * 2
      }
      transformKernel.update(
        draft,
        createPointerInput({
          viewport,
          pointerId,
          client
        }),
        TRANSFORM_CONSTRAINTS
      )
    }

    const samples: number[] = []
    for (let frame = 0; frame < MEASURE_FRAMES; frame += 1) {
      const client = {
        x: startClient.x + (WARMUP_FRAMES + frame) * 0.8,
        y: startClient.y + (WARMUP_FRAMES + frame) * 0.5 + Math.sin(frame / 12) * 2
      }
      const startedAt = now()
      transformKernel.update(
        draft,
        createPointerInput({
          viewport,
          pointerId,
          client
        }),
        TRANSFORM_CONSTRAINTS
      )
      samples.push(now() - startedAt)
    }

    transformKernel.commit(draft)

    const resetDoc = cloneDoc(doc)
    const resetNode = resetDoc.nodes.entities[nodeId]
    if (resetNode) {
      resetNode.position = basePosition
      resetNode.size = baseSize
    }
    syncDoc(resetDoc)
    runSamples.push(samples)
  }

  const allSamples = runSamples.flat()
  const p50 = percentile(allSamples, 50)
  const p95 = percentile(allSamples, 95)
  const p99 = percentile(allSamples, 99)
  const avg = average(allSamples)
  const max = allSamples.length ? Math.max(...allSamples) : 0
  const min = allSamples.length ? Math.min(...allSamples) : 0
  const pass = p95 < FRAME_BUDGET_MS

  console.log(
    [
      'node-transform-frame bench',
      `nodes=${NODE_COUNT}`,
      `edges=${EDGE_COUNT}`,
      `runs=${RUNS}`,
      `warmup=${WARMUP_FRAMES}`,
      `frames=${MEASURE_FRAMES}`
    ].join(' | ')
  )
  runSamples.forEach((samples, index) => {
    console.log(
      [
        `run-${index + 1}`,
        `p50=${format(percentile(samples, 50))}`,
        `p95=${format(percentile(samples, 95))}`,
        `p99=${format(percentile(samples, 99))}`,
        `avg=${format(average(samples))}`,
        `max=${format(Math.max(...samples))}`
      ].join(' | ')
    )
  })
  console.log(
    [
      'overall',
      `min=${format(min)}`,
      `p50=${format(p50)}`,
      `p95=${format(p95)}`,
      `p99=${format(p99)}`,
      `avg=${format(avg)}`,
      `max=${format(max)}`
    ].join(' | ')
  )
  console.log(['target', `p95<${FRAME_BUDGET_MS}ms`, pass ? 'PASS' : 'FAIL'].join(' | '))

  if (ENFORCE_THRESHOLD && !pass && runtime.process) {
    runtime.process.exitCode = 1
    console.error(
      [
        'threshold check failed',
        `expected p95<${FRAME_BUDGET_MS}ms`,
        `actual p95=${format(p95)}`
      ].join(' | ')
    )
  }
}

main()
