import {
  equal
} from '@shared/core'
import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import type {
  MutationDeltaInput,
  MutationCustomTable,
  MutationFootprint
} from '@shared/mutation'
import type {
  MutationCustomReduceInput
} from '@shared/mutation/engine'
import {
  createEdgeLabelPatch,
  readEdgeLabelUpdateFromPatch
} from '@whiteboard/core/edge/update'
import {
  createDocumentReader,
  type DocumentReader
} from '@whiteboard/core/document/reader'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  createMindmapTopicPatch,
  readMindmapTopicUpdateFromPatch
} from '@whiteboard/core/mindmap/ops'
import {
  whiteboardMutationBuilder
} from '@whiteboard/core/mutation'
import { node as nodeApi } from '@whiteboard/core/node'
import type {
  WhiteboardCompileServices
} from '@whiteboard/core/operations/compile'
import type {
  CanvasItemRef,
  CanvasOrderAnchor,
  Document,
  Edge,
  EdgeId,
  EdgeLabel,
  EdgeLabelAnchor,
  EdgeLabelFieldPatch,
  EdgeRoutePoint,
  EdgeRoutePointAnchor,
  MindmapBranchFieldPatch,
  MindmapId,
  MindmapLayoutSpec,
  MindmapRecord,
  MindmapSnapshot,
  MindmapTopicSnapshot,
  Node,
  NodeId,
  Operation,
  Point,
  ResultCode
} from '@whiteboard/core/types'
import {
  clone,
  createWhiteboardCustomResult,
  entityKey,
  fieldKey,
  type CustomResult,
  type WhiteboardCustomCode,
  type WhiteboardCustomOperation,
  recordKey,
  relationKey,
  uniqueSorted
} from '@whiteboard/core/operations/customShared'

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const same = (
  left: unknown,
  right: unknown
): boolean => equal.sameJsonValue(left, right)

type WhiteboardCustomReduceContext<
  TOp extends WhiteboardCustomOperation = WhiteboardCustomOperation
> = MutationCustomReduceInput<
  Document,
  TOp,
  DocumentReader,
  WhiteboardCompileServices,
  WhiteboardCustomCode
>

type OrderedAnchor = {
  kind: 'start'
} | {
  kind: 'end'
} | {
  kind: 'before'
  itemId: string
} | {
  kind: 'after'
  itemId: string
}

const removeOrderedItem = <T,>(
  items: readonly T[],
  itemId: string,
  getId: (item: T) => string
): T[] => {
  const index = items.findIndex((item) => getId(item) === itemId)
  if (index < 0) {
    return [...items]
  }

  return [
    ...items.slice(0, index),
    ...items.slice(index + 1)
  ]
}

const insertOrderedItem = <T,>(
  items: readonly T[],
  item: T,
  anchor: OrderedAnchor,
  getId: (entry: T) => string
): T[] => {
  const itemId = getId(item)
  const filtered = removeOrderedItem(items, itemId, getId)

  if (anchor.kind === 'start') {
    return [item, ...filtered]
  }
  if (anchor.kind === 'end') {
    return [...filtered, item]
  }

  const anchorIndex = filtered.findIndex((entry) => getId(entry) === anchor.itemId)
  if (anchorIndex < 0) {
    return anchor.kind === 'before'
      ? [item, ...filtered]
      : [...filtered, item]
  }

  return anchor.kind === 'before'
    ? [...filtered.slice(0, anchorIndex), item, ...filtered.slice(anchorIndex)]
    : [...filtered.slice(0, anchorIndex + 1), item, ...filtered.slice(anchorIndex + 1)]
}

const moveOrderedItem = <T,>(
  items: readonly T[],
  itemId: string,
  anchor: OrderedAnchor,
  getId: (entry: T) => string
): T[] => {
  const item = items.find((entry) => getId(entry) === itemId)
  if (!item) {
    return [...items]
  }

  return insertOrderedItem(items, item, anchor, getId)
}

const readOrderedSlot = <T,>(
  items: readonly T[],
  itemId: string,
  getId: (entry: T) => string
): {
  prev?: T
  next?: T
} | undefined => {
  const index = items.findIndex((entry) => getId(entry) === itemId)
  if (index < 0) {
    return undefined
  }

  return {
    prev: items[index - 1],
    next: items[index + 1]
  }
}

const insertOrderedSlot = <T,>(
  items: readonly T[],
  item: T,
  slot: {
    prev?: T
    next?: T
  } | undefined,
  getId: (entry: T) => string
): T[] => {
  const itemId = getId(item)
  const filtered = removeOrderedItem(items, itemId, getId)

  if (!slot) {
    return [...filtered, item]
  }
  if (slot.prev) {
    return insertOrderedItem(filtered, item, {
      kind: 'after',
      itemId: getId(slot.prev)
    }, getId)
  }
  if (slot.next) {
    return insertOrderedItem(filtered, item, {
      kind: 'before',
      itemId: getId(slot.next)
    }, getId)
  }

  return [...filtered, item]
}

const canvasRefKey = (
  ref: CanvasItemRef
): string => `${ref.kind}:${ref.id}`

const cloneCanvasRef = (
  ref: CanvasItemRef | undefined
): CanvasItemRef | undefined => (
  ref
    ? {
        kind: ref.kind,
        id: ref.id
      }
    : undefined
)

const toOrderedAnchor = (
  anchor: EdgeLabelAnchor | EdgeRoutePointAnchor
): OrderedAnchor => (
  anchor.kind === 'start' || anchor.kind === 'end'
    ? anchor
    : anchor.kind === 'before'
      ? {
          kind: 'before',
          itemId: 'labelId' in anchor
            ? anchor.labelId
            : anchor.pointId
        }
      : {
          kind: 'after',
          itemId: 'labelId' in anchor
            ? anchor.labelId
            : anchor.pointId
        }
)

const readCanvasPreviousTo = (
  order: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[]
): CanvasOrderAnchor => {
  const existing = refs.filter((ref) => order.some((entry) => canvasRefKey(entry) === canvasRefKey(ref)))
  const previousIndex = order.findIndex((entry) => canvasRefKey(entry) === canvasRefKey(existing[0]!))
  return previousIndex <= 0
    ? {
        kind: 'front'
      }
    : {
        kind: 'after',
        ref: cloneCanvasRef(order[previousIndex - 1])!
      }
}

const moveCanvasOrder = (
  order: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[],
  to: CanvasOrderAnchor
): CanvasItemRef[] => {
  const existingRefs = refs.filter((ref) => order.some((entry) => canvasRefKey(entry) === canvasRefKey(ref)))
  if (!existingRefs.length) {
    return [...order]
  }

  const existingKeys = new Set(existingRefs.map((ref) => canvasRefKey(ref)))
  const filtered = order.filter((entry) => !existingKeys.has(canvasRefKey(entry)))
  const insertAt = to.kind === 'front'
    ? 0
    : to.kind === 'back'
      ? filtered.length
      : (() => {
          const anchorKey = canvasRefKey(to.ref)
          const anchorIndex = filtered.findIndex((entry) => canvasRefKey(entry) === anchorKey)
          if (anchorIndex < 0) {
            return to.kind === 'before'
              ? 0
              : filtered.length
          }
          return to.kind === 'before'
            ? anchorIndex
            : anchorIndex + 1
        })()

  return [
    ...filtered.slice(0, insertAt),
    ...existingRefs.map((ref) => cloneCanvasRef(ref)!),
    ...filtered.slice(insertAt)
  ]
}

const readCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
) => {
  const slot = readOrderedSlot(order, canvasRefKey(ref), canvasRefKey)
  return slot
    ? {
        prev: cloneCanvasRef(slot.prev),
        next: cloneCanvasRef(slot.next)
      }
    : undefined
}

const insertCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef,
  slot?: {
    prev?: CanvasItemRef
    next?: CanvasItemRef
  }
): CanvasItemRef[] => insertOrderedSlot(
  order,
  cloneCanvasRef(ref)!,
  slot
    ? {
        prev: cloneCanvasRef(slot.prev),
        next: cloneCanvasRef(slot.next)
      }
    : undefined,
  canvasRefKey
)

const removeCanvasRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
): CanvasItemRef[] => removeOrderedItem(
  order,
  canvasRefKey(ref),
  canvasRefKey
)

const appendCanvasRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
): CanvasItemRef[] => (
  order.some((entry) => canvasRefKey(entry) === canvasRefKey(ref))
    ? [...order]
    : [...order, cloneCanvasRef(ref)!]
)

const getLabels = (
  edge: Edge
): readonly EdgeLabel[] => edge.labels ?? []

const getManualRoutePoints = (
  edge: Edge
): readonly EdgeRoutePoint[] => (
  edge.route?.kind === 'manual'
    ? edge.route.points
    : []
)

const readLabelAnchorFromIndex = (
  labels: readonly EdgeLabel[],
  index: number
): EdgeLabelAnchor => index <= 0
  ? { kind: 'start' }
  : {
      kind: 'after',
      labelId: labels[index - 1]!.id
    }

const readPointAnchorFromIndex = (
  points: readonly EdgeRoutePoint[],
  index: number
): EdgeRoutePointAnchor => index <= 0
  ? { kind: 'start' }
  : {
      kind: 'after',
      pointId: points[index - 1]!.id
    }

const toMindmapRecord = (
  id: MindmapId,
  tree: ReturnType<typeof mindmapApi.tree.fromRecord>
): MindmapRecord => ({
  id,
  root: tree.rootNodeId,
  members: Object.fromEntries(
    Object.entries(tree.nodes).map(([nodeId, node]) => [
      nodeId,
      {
        parentId: node.parentId,
        side: node.side,
        collapsed: node.collapsed,
        branchStyle: clone(node.branch)!
      }
    ])
  ),
  children: clone(tree.children)!,
  layout: clone(tree.layout)!
})

const readMindmapLayoutRects = (
  reader: DocumentReader,
  id: MindmapId
): ReturnType<typeof mindmapApi.layout.anchor>['node'] | undefined => {
  const record = reader.mindmaps.get(id)
  const tree = reader.mindmaps.tree(id)
  if (!record || !tree) {
    return undefined
  }

  const root = reader.nodes.get(record.root)
  if (!root) {
    return undefined
  }

  const computed = mindmapApi.layout.compute(
    tree,
    (nodeId) => {
      const node = reader.nodes.get(nodeId)
      return {
        width: Math.max(node?.size?.width ?? 1, 1),
        height: Math.max(node?.size?.height ?? 1, 1)
      }
    },
    tree.layout
  )
  return mindmapApi.layout.anchor({
    tree,
    computed,
    position: root.position
  }).node
}

const readMindmapLayoutChangedNodeIds = (input: {
  before: Document
  after: Document
  id: MindmapId
  exclude?: Iterable<NodeId>
}): readonly NodeId[] => {
  const beforeRects = readMindmapLayoutRects(
    createDocumentReader(() => input.before),
    input.id
  ) ?? {}
  const afterRects = readMindmapLayoutRects(
    createDocumentReader(() => input.after),
    input.id
  ) ?? {}
  const excluded = new Set(input.exclude ?? [])
  const nodeIds = new Set<NodeId>([
    ...Object.keys(beforeRects) as NodeId[],
    ...Object.keys(afterRects) as NodeId[]
  ])

  return uniqueSorted(
    [...nodeIds].filter((nodeId) => (
      !excluded.has(nodeId)
      && !same(beforeRects[nodeId], afterRects[nodeId])
    ))
  ) as readonly NodeId[]
}

type WhiteboardIdsDeltaKey = Parameters<typeof whiteboardMutationBuilder.ids>[0]
type WhiteboardFlagDeltaKey = Parameters<typeof whiteboardMutationBuilder.flag>[0]

const createIdsDelta = <TKey extends WhiteboardIdsDeltaKey>(
  key: TKey,
  ids: readonly string[]
): MutationDeltaInput | undefined => ids.length
  ? whiteboardMutationBuilder.ids(key, ids as never) as MutationDeltaInput
  : undefined

const createFlagDelta = <TKey extends WhiteboardFlagDeltaKey>(
  key: TKey,
  enabled = true
): MutationDeltaInput | undefined => enabled
  ? whiteboardMutationBuilder.flag(key) as MutationDeltaInput
  : undefined

const mergeDelta = (
  ...inputs: readonly (MutationDeltaInput | undefined)[]
): MutationDeltaInput => whiteboardMutationBuilder.merge(...inputs) as MutationDeltaInput

const createNodeGeometryDelta = (
  nodeIds: readonly NodeId[]
): MutationDeltaInput | undefined => createIdsDelta('node.geometry', nodeIds)

const createNodeOwnerDelta = (
  nodeIds: readonly NodeId[]
): MutationDeltaInput | undefined => createIdsDelta('node.owner', nodeIds)

const createNodeContentDelta = (
  nodeIds: readonly NodeId[]
): MutationDeltaInput | undefined => createIdsDelta('node.content', nodeIds)

const createNodeCreateDelta = (
  nodeIds: readonly NodeId[]
): MutationDeltaInput => mergeDelta(
  createIdsDelta('node.create', nodeIds),
  createNodeGeometryDelta(nodeIds),
  createNodeOwnerDelta(nodeIds),
  createNodeContentDelta(nodeIds)
)

const createNodeDeleteDelta = (
  nodeIds: readonly NodeId[]
): MutationDeltaInput => mergeDelta(
  createIdsDelta('node.delete', nodeIds),
  createNodeGeometryDelta(nodeIds),
  createNodeOwnerDelta(nodeIds),
  createNodeContentDelta(nodeIds)
)

const createEdgeLabelsDelta = (
  edgeIds: readonly EdgeId[]
): MutationDeltaInput | undefined => createIdsDelta('edge.labels', edgeIds)

const createEdgeRouteDelta = (
  edgeIds: readonly EdgeId[]
): MutationDeltaInput | undefined => createIdsDelta('edge.route', edgeIds)

const createEdgeCreateDelta = (
  edgeIds: readonly EdgeId[]
): MutationDeltaInput => mergeDelta(
  createIdsDelta('edge.create', edgeIds),
  createIdsDelta('edge.endpoints', edgeIds),
  createEdgeRouteDelta(edgeIds),
  createIdsDelta('edge.style', edgeIds),
  createEdgeLabelsDelta(edgeIds),
  createIdsDelta('edge.data', edgeIds)
)

const createEdgeDeleteDelta = (
  edgeIds: readonly EdgeId[]
): MutationDeltaInput => mergeDelta(
  createIdsDelta('edge.delete', edgeIds),
  createIdsDelta('edge.endpoints', edgeIds),
  createEdgeRouteDelta(edgeIds),
  createIdsDelta('edge.style', edgeIds),
  createEdgeLabelsDelta(edgeIds),
  createIdsDelta('edge.data', edgeIds)
)

const createMindmapStructureDelta = (
  mindmapIds: readonly MindmapId[]
): MutationDeltaInput | undefined => createIdsDelta('mindmap.structure', mindmapIds)

const createMindmapLayoutDelta = (
  mindmapIds: readonly MindmapId[]
): MutationDeltaInput | undefined => createIdsDelta('mindmap.layout', mindmapIds)

const createMindmapCreateDelta = (
  mindmapIds: readonly MindmapId[]
): MutationDeltaInput => mergeDelta(
  createIdsDelta('mindmap.create', mindmapIds),
  createMindmapStructureDelta(mindmapIds),
  createMindmapLayoutDelta(mindmapIds)
)

const createMindmapDeleteDelta = (
  mindmapIds: readonly MindmapId[]
): MutationDeltaInput => mergeDelta(
  createIdsDelta('mindmap.delete', mindmapIds),
  createMindmapStructureDelta(mindmapIds),
  createMindmapLayoutDelta(mindmapIds)
)

const createCanvasOrderDelta = (
  changed = true
): MutationDeltaInput | undefined => createFlagDelta('canvas.order', changed)

const createEntityFootprints = (
  family: 'node' | 'edge' | 'group' | 'mindmap',
  ids: readonly string[]
): MutationFootprint[] => ids.map((id) => entityKey(family, id))

const createMindmapSnapshot = (
  reader: DocumentReader,
  id: MindmapId
): MindmapSnapshot => {
  const mindmap = reader.mindmaps.get(id)
  const tree = reader.mindmaps.tree(id)
  if (!mindmap || !tree) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  const nodeIds = new Set(reader.mindmaps.subtreeNodeIds(id, tree.rootNodeId))
  return {
    mindmap: clone(mindmap)!,
    nodes: [...nodeIds].flatMap((nodeId) => {
      const node = reader.nodes.get(nodeId)
      return node
        ? [clone(node)!]
        : []
    }),
    slot: reader.canvas.slot({
      kind: 'mindmap',
      id
    })
  }
}

const createMindmapTopicSnapshot = (
  reader: DocumentReader,
  id: MindmapId,
  rootId: NodeId
): MindmapTopicSnapshot => {
  const current = reader.mindmaps.get(id)
  const tree = reader.mindmaps.tree(id)
  if (!current || !tree) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  const rootMember = current.members[rootId]
  const parentId = rootMember?.parentId
  if (!parentId) {
    throw new Error(`Topic ${rootId} parent missing.`)
  }

  const siblings = current.children[parentId] ?? []
  const index = siblings.indexOf(rootId)
  const nodeIds = new Set(reader.mindmaps.subtreeNodeIds(id, rootId))

  return {
    root: rootId,
    slot: {
      parent: parentId,
      prev: index > 0
        ? siblings[index - 1]
        : undefined,
      next: index >= 0
        ? siblings[index + 1]
        : undefined
    },
    nodes: [...nodeIds].flatMap((nodeId) => {
      const node = reader.nodes.get(nodeId)
      return node
        ? [clone(node)!]
        : []
    }),
    members: Object.fromEntries(
      [...nodeIds].map((nodeId) => [
        nodeId,
        clone(current.members[nodeId])!
      ])
    ) as MindmapTopicSnapshot['members'],
    children: Object.fromEntries(
      [...nodeIds].map((nodeId) => [
        nodeId,
        clone(current.children[nodeId] ?? [])!
      ])
    )
  }
}

const createMindmapResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.create' }>
    document: Document
  }
): CustomResult => {
  const before = input.document
  const nextBase: Document = {
    ...before,
    nodes: {
      ...before.nodes,
      ...Object.fromEntries(input.op.nodes.map((node) => [node.id, clone(node)!]))
    },
    mindmaps: {
      ...before.mindmaps,
      [input.op.mindmap.id]: clone(input.op.mindmap)!
    },
    canvas: {
      ...before.canvas,
      order: appendCanvasRef(before.canvas.order, {
        kind: 'mindmap',
        id: input.op.mindmap.id
      })
    }
  }

  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createNodeCreateDelta(input.op.nodes.map((node) => node.id)),
      createMindmapCreateDelta([input.op.mindmap.id]),
      createCanvasOrderDelta()
    ),
    footprint: [
      ...createEntityFootprints('node', input.op.nodes.map((node) => node.id)),
      ...createEntityFootprints('mindmap', [input.op.mindmap.id]),
      fieldKey('document', 'document', 'canvas.order')
    ],
    history: {
      inverse: [{
        type: 'mindmap.delete',
        id: input.op.mindmap.id
      }]
    }
  })
}

const createMindmapRestoreResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.restore' }>
    document: Document
  }
): CustomResult => {
  const before = input.document
  const nextBase: Document = {
    ...before,
    nodes: {
      ...before.nodes,
      ...Object.fromEntries(input.op.snapshot.nodes.map((node) => [node.id, clone(node)!]))
    },
    mindmaps: {
      ...before.mindmaps,
      [input.op.snapshot.mindmap.id]: clone(input.op.snapshot.mindmap)!
    },
    canvas: {
      ...before.canvas,
      order: insertCanvasSlot(before.canvas.order, {
        kind: 'mindmap',
        id: input.op.snapshot.mindmap.id
      }, input.op.snapshot.slot)
    }
  }

  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createNodeCreateDelta(input.op.snapshot.nodes.map((node) => node.id)),
      createMindmapCreateDelta([input.op.snapshot.mindmap.id]),
      createCanvasOrderDelta()
    ),
    footprint: [
      ...createEntityFootprints('node', input.op.snapshot.nodes.map((node) => node.id)),
      ...createEntityFootprints('mindmap', [input.op.snapshot.mindmap.id]),
      fieldKey('document', 'document', 'canvas.order')
    ],
    history: {
      inverse: [{
        type: 'mindmap.delete',
        id: input.op.snapshot.mindmap.id
      }]
    }
  })
}

const createMindmapDeleteResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.delete' }>
    document: Document
  }
): CustomResult | void => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  const tree = reader.mindmaps.tree(input.op.id)
  if (!current || !tree) {
    return
  }

  const before = input.document
  const snapshot = createMindmapSnapshot(reader, input.op.id)
  const nodeIds = new Set(reader.mindmaps.subtreeNodeIds(input.op.id, tree.rootNodeId))
  const connectedEdges = reader.edges.connectedToNodes(nodeIds)
  const edgeIds = connectedEdges.map((edge) => edge.id)

  const nextNodes = {
    ...before.nodes
  }
  nodeIds.forEach((nodeId) => {
    delete nextNodes[nodeId]
  })
  const nextEdges = {
    ...before.edges
  }
  edgeIds.forEach((edgeId) => {
    delete nextEdges[edgeId]
  })

  let nextOrder = removeCanvasRef(before.canvas.order, {
    kind: 'mindmap',
    id: input.op.id
  })
  edgeIds.forEach((edgeId) => {
    nextOrder = removeCanvasRef(nextOrder, {
      kind: 'edge',
      id: edgeId
    })
  })

  const next: Document = {
    ...before,
    nodes: nextNodes,
    edges: nextEdges,
    mindmaps: Object.fromEntries(
      Object.entries(before.mindmaps).filter(([id]) => id !== input.op.id)
    ),
    canvas: {
      ...before.canvas,
      order: nextOrder
    }
  }

  const inverse: Operation[] = [{
    type: 'mindmap.restore',
    snapshot
  }]
  connectedEdges.forEach((edge) => {
    const slot = readCanvasSlot(before.canvas.order, {
      kind: 'edge',
      id: edge.id
    })
    inverse.push({
      type: 'edge.create',
      value: clone(edge)!
    })
    if (slot) {
      inverse.push({
        type: 'canvas.order.move',
        refs: [{
          kind: 'edge',
          id: edge.id
        }],
        to: slot.prev
          ? {
              kind: 'after',
              ref: slot.prev
            }
          : slot.next
            ? {
                kind: 'before',
                ref: slot.next
              }
            : {
                kind: 'front'
              }
      })
    }
  })

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createNodeDeleteDelta([...nodeIds]),
      createEdgeDeleteDelta(edgeIds),
      createMindmapDeleteDelta([input.op.id]),
      createCanvasOrderDelta()
    ),
    footprint: [
      ...createEntityFootprints('node', [...nodeIds]),
      ...createEntityFootprints('edge', edgeIds),
      ...createEntityFootprints('mindmap', [input.op.id]),
      fieldKey('document', 'document', 'canvas.order')
    ],
    history: {
      inverse
    }
  })
}

const createMindmapMoveResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.move' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  const root = current
    ? reader.nodes.get(current.root)
    : undefined
  if (!current || !root) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const before = input.document
  const nextBase: Document = {
    ...before,
    nodes: {
      ...before.nodes,
      [root.id]: {
        ...root,
        position: clone(input.op.position)!
      }
    }
  }
  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createNodeGeometryDelta([root.id]),
      createMindmapLayoutDelta([input.op.id])
    ),
    footprint: [
      fieldKey('node', root.id, 'position'),
      fieldKey('mindmap', input.op.id, 'layout')
    ],
    history: {
      inverse: [{
        type: 'mindmap.move',
        id: input.op.id,
        position: clone(root.position)!
      }]
    }
  })
}

const createMindmapLayoutResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.layout' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const before = input.document
  const nextBase: Document = {
    ...before,
    mindmaps: {
      ...before.mindmaps,
      [input.op.id]: {
        ...current,
        layout: {
          ...current.layout,
          ...clone(input.op.patch)
        }
      }
    }
  }
  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createMindmapLayoutDelta([input.op.id])
    ),
    footprint: [
      fieldKey('mindmap', input.op.id, 'layout')
    ],
    history: {
      inverse: [{
        type: 'mindmap.layout',
        id: input.op.id,
        patch: clone(current.layout)!
      }]
    }
  })
}

const createMindmapTopicInsertResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.insert' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const before = input.document
  const tree = mindmapApi.tree.fromRecord(current)
  const inserted = mindmapApi.tree.insertNode(tree, input.op.input, {
    idGenerator: {
      nodeId: () => input.op.node.id
    }
  })
  if (!inserted.ok) {
    return input.fail({
      code: inserted.error.code,
      message: inserted.error.message
    })
  }

  const nextBase: Document = {
    ...before,
    nodes: {
      ...before.nodes,
      [input.op.node.id]: clone(input.op.node)!
    },
    mindmaps: {
      ...before.mindmaps,
      [input.op.id]: toMindmapRecord(input.op.id, inserted.data.tree)
    }
  }
  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createNodeCreateDelta([input.op.node.id]),
      createMindmapStructureDelta([input.op.id])
    ),
    footprint: [
      ...createEntityFootprints('node', [input.op.node.id]),
      fieldKey('mindmap', input.op.id, 'structure')
    ],
    history: {
      inverse: [{
        type: 'mindmap.topic.delete',
        id: input.op.id,
        input: {
          nodeId: input.op.node.id
        }
      }]
    }
  })
}

const createMindmapTopicRestoreResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.restore' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const before = input.document
  const nextMembers: MindmapRecord['members'] = {
    ...current.members,
    ...(Object.fromEntries(
      Object.entries(input.op.snapshot.members).map(([nodeId, member]) => [
        nodeId,
        clone(member)!
      ])
    ) as MindmapRecord['members'])
  }
  const nextChildren = {
    ...current.children
  }
  Object.entries(input.op.snapshot.children).forEach(([nodeId, children]) => {
    nextChildren[nodeId] = [...children]
  })
  const siblings = [...(nextChildren[input.op.snapshot.slot.parent] ?? [])]
  if (input.op.snapshot.slot.prev) {
    const index = siblings.indexOf(input.op.snapshot.slot.prev)
    if (index >= 0) {
      siblings.splice(index + 1, 0, input.op.snapshot.root)
    } else {
      siblings.push(input.op.snapshot.root)
    }
  } else if (input.op.snapshot.slot.next) {
    const index = siblings.indexOf(input.op.snapshot.slot.next)
    if (index >= 0) {
      siblings.splice(index, 0, input.op.snapshot.root)
    } else {
      siblings.unshift(input.op.snapshot.root)
    }
  } else {
    siblings.push(input.op.snapshot.root)
  }
  nextChildren[input.op.snapshot.slot.parent] = siblings

  const nextBase: Document = {
    ...before,
    nodes: {
      ...before.nodes,
      ...Object.fromEntries(input.op.snapshot.nodes.map((node) => [node.id, clone(node)!]))
    },
    mindmaps: {
      ...before.mindmaps,
      [input.op.id]: {
        ...current,
        members: nextMembers,
        children: nextChildren
      }
    }
  }
  const createdNodeIds = input.op.snapshot.nodes.map((node) => node.id)
  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createNodeCreateDelta(createdNodeIds),
      createMindmapStructureDelta([input.op.id])
    ),
    footprint: [
      ...createEntityFootprints('node', createdNodeIds),
      fieldKey('mindmap', input.op.id, 'structure')
    ],
    history: {
      inverse: [{
        type: 'mindmap.topic.delete',
        id: input.op.id,
        input: {
          nodeId: input.op.snapshot.root
        }
      }]
    }
  })
}

const createMindmapTopicMoveResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.move' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const tree = mindmapApi.tree.fromRecord(current)
  const member = current.members[input.op.input.nodeId]
  if (!member?.parentId) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.input.nodeId} cannot move.`
    })
  }

  const moved = mindmapApi.tree.moveSubtree(tree, input.op.input)
  if (!moved.ok) {
    return input.fail({
      code: moved.error.code,
      message: moved.error.message
    })
  }

  const prevSiblings = current.children[member.parentId] ?? []
  const prevIndex = prevSiblings.indexOf(input.op.input.nodeId)
  const before = input.document
  const nextBase: Document = {
    ...before,
    mindmaps: {
      ...before.mindmaps,
      [input.op.id]: toMindmapRecord(input.op.id, moved.data.tree)
    }
  }
  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createMindmapStructureDelta([input.op.id])
    ),
    footprint: [
      fieldKey('mindmap', input.op.id, 'structure')
    ],
    history: {
      inverse: [{
        type: 'mindmap.topic.move',
        id: input.op.id,
        input: {
          nodeId: input.op.input.nodeId,
          parentId: member.parentId,
          index: prevIndex < 0 ? undefined : prevIndex,
          side: member.side
        }
      }]
    }
  })
}

const createMindmapTopicDeleteResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.delete' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  const tree = reader.mindmaps.tree(input.op.id)
  if (!current || !tree) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }
  if (input.op.input.nodeId === current.root) {
    return input.fail({
      code: 'invalid',
      message: 'Root topic cannot use mindmap.topic.delete.'
    })
  }

  const before = input.document
  const snapshot = createMindmapTopicSnapshot(reader, input.op.id, input.op.input.nodeId)
  const nodeIds = new Set(reader.mindmaps.subtreeNodeIds(input.op.id, input.op.input.nodeId))
  const connectedEdges = reader.edges.connectedToNodes(nodeIds)
  const edgeIds = connectedEdges.map((edge) => edge.id)
  const removed = mindmapApi.tree.removeSubtree(tree, input.op.input)
  if (!removed.ok) {
    return input.fail({
      code: removed.error.code,
      message: removed.error.message
    })
  }

  const nextNodes = {
    ...before.nodes
  }
  nodeIds.forEach((nodeId) => {
    delete nextNodes[nodeId]
  })
  const nextEdges = {
    ...before.edges
  }
  edgeIds.forEach((edgeId) => {
    delete nextEdges[edgeId]
  })
  let nextOrder = before.canvas.order
  edgeIds.forEach((edgeId) => {
    nextOrder = removeCanvasRef(nextOrder, {
      kind: 'edge',
      id: edgeId
    })
  })
  const nextBase: Document = {
    ...before,
    nodes: nextNodes,
    edges: nextEdges,
    mindmaps: {
      ...before.mindmaps,
      [input.op.id]: toMindmapRecord(input.op.id, removed.data.tree)
    },
    canvas: {
      ...before.canvas,
      order: nextOrder
    }
  }
  const inverse: Operation[] = [{
    type: 'mindmap.topic.restore',
    id: input.op.id,
    snapshot
  }]
  connectedEdges.forEach((edge) => {
    const slot = readCanvasSlot(before.canvas.order, {
      kind: 'edge',
      id: edge.id
    })
    inverse.push({
      type: 'edge.create',
      value: clone(edge)!
    })
    if (slot) {
      inverse.push({
        type: 'canvas.order.move',
        refs: [{
          kind: 'edge',
          id: edge.id
        }],
        to: slot.prev
          ? {
              kind: 'after',
              ref: slot.prev
            }
          : slot.next
            ? {
                kind: 'before',
                ref: slot.next
              }
            : {
                kind: 'front'
              }
      })
    }
  })

  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createNodeDeleteDelta([...nodeIds]),
      createEdgeDeleteDelta(edgeIds),
      createMindmapStructureDelta([input.op.id]),
      createCanvasOrderDelta(edgeIds.length > 0)
    ),
    footprint: [
      ...createEntityFootprints('node', [...nodeIds]),
      ...createEntityFootprints('edge', edgeIds),
      fieldKey('mindmap', input.op.id, 'structure'),
      ...(edgeIds.length > 0
        ? [fieldKey('document', 'document', 'canvas.order')]
        : [])
    ],
    history: {
      inverse
    }
  })
}

const createMindmapTopicPatchResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.patch' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.nodes.get(input.op.topicId)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.topicId} not found.`
    })
  }

  const update = readMindmapTopicUpdateFromPatch(input.op.patch)
  const inverse = nodeApi.update.inverse(current, update)
  if (!inverse.ok) {
    return input.fail({
      code: 'invalid',
      message: inverse.message
    })
  }
  const applied = nodeApi.update.apply(current, update)
  if (!applied.ok) {
    return input.fail({
      code: 'invalid',
      message: applied.message
    })
  }

  const before = input.document
  const nextBase: Document = {
    ...before,
    nodes: {
      ...before.nodes,
      [input.op.topicId]: applied.next
    }
  }
  const relayoutNodeIds = readMindmapLayoutChangedNodeIds({
    before,
    after: nextBase,
    id: input.op.id
  })

  const footprint: MutationFootprint[] = relayoutNodeIds.length > 0
    ? [
        entityKey('mindmap', input.op.id),
        fieldKey('mindmap', input.op.id, 'layout')
      ]
    : [
        entityKey('mindmap', input.op.id)
      ]
  Object.keys(update.fields ?? {}).forEach((field) => {
    footprint.push(fieldKey('node', input.op.topicId, field))
  })
  Object.keys(update.record ?? {}).forEach((path) => {
    if (path === 'data' || path.startsWith('data.')) {
      footprint.push(
        path === 'data'
          ? fieldKey('node', input.op.topicId, 'data')
          : recordKey('node', input.op.topicId, 'data', path.slice('data.'.length))
      )
    } else if (path === 'style' || path.startsWith('style.')) {
      footprint.push(
        path === 'style'
          ? fieldKey('node', input.op.topicId, 'style')
          : recordKey('node', input.op.topicId, 'style', path.slice('style.'.length))
      )
    }
  })

  const topicDelta = mergeDelta(
    (hasOwn(update.fields ?? {}, 'size') || hasOwn(update.fields ?? {}, 'rotation'))
      ? createNodeGeometryDelta([input.op.topicId])
      : undefined,
    (hasOwn(update.fields ?? {}, 'locked') || Object.keys(update.record ?? {}).length > 0)
      ? createNodeContentDelta([input.op.topicId])
      : undefined,
    relayoutNodeIds.length > 0
      ? createMindmapLayoutDelta([input.op.id])
      : undefined
  )

  return createWhiteboardCustomResult({
    document: nextBase,
    delta: topicDelta,
    footprint,
    history: {
      inverse: [{
        type: 'mindmap.topic.patch',
        id: input.op.id,
        topicId: input.op.topicId,
        patch: createMindmapTopicPatch(inverse.update)
      }]
    }
  })
}

const createMindmapBranchPatchResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.branch.patch' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult | void => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const member = current.members[input.op.topicId]
  if (!member) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.topicId} not found.`
    })
  }

  const nextBranchStyle: MindmapRecord['members'][NodeId]['branchStyle'] = {
    ...member.branchStyle
  }
  const inverse: MindmapBranchFieldPatch = {}
  let changed = false
  ;(['color', 'line', 'width', 'stroke'] as const).forEach((field) => {
    if (!hasOwn(input.op.patch, field)) {
      return
    }
    const value = input.op.patch[field]
    if (value === undefined || same(value, member.branchStyle[field])) {
      return
    }
    changed = true
    switch (field) {
      case 'color':
        inverse.color = clone(member.branchStyle.color)
        nextBranchStyle.color = clone(input.op.patch.color)!
        return
      case 'line':
        inverse.line = clone(member.branchStyle.line)
        nextBranchStyle.line = clone(input.op.patch.line)!
        return
      case 'width':
        inverse.width = clone(member.branchStyle.width)
        nextBranchStyle.width = clone(input.op.patch.width)!
        return
      case 'stroke':
        inverse.stroke = clone(member.branchStyle.stroke)
        nextBranchStyle.stroke = clone(input.op.patch.stroke)!
        return
    }
  })
  if (!changed) {
    return
  }

  const before = input.document
  const nextBase: Document = {
    ...before,
    mindmaps: {
      ...before.mindmaps,
      [input.op.id]: {
        ...current,
        members: {
          ...current.members,
          [input.op.topicId]: {
            ...member,
            branchStyle: nextBranchStyle
          }
        }
      }
    }
  }
  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createMindmapStructureDelta([input.op.id])
    ),
    footprint: Object.keys(input.op.patch).map((field) => (
      fieldKey('mindmap', input.op.id, `branch.${input.op.topicId}.${field}`)
    )),
    history: {
      inverse: [{
        type: 'mindmap.branch.patch',
        id: input.op.id,
        topicId: input.op.topicId,
        patch: inverse
      }]
    }
  })
}

const createMindmapTopicCollapseResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.collapse' }>
    document: Document
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const member = current.members[input.op.topicId]
  if (!member) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.topicId} not found.`
    })
  }

  const nextCollapsed = input.op.collapsed ?? !member.collapsed
  if (same(nextCollapsed, member.collapsed)) {
    return {
      document: input.document,
      delta: {},
      footprint: [],
      history: {
        inverse: []
      }
    }
  }

  const before = input.document
  const nextBase: Document = {
    ...before,
    mindmaps: {
      ...before.mindmaps,
      [input.op.id]: {
        ...current,
        members: {
          ...current.members,
          [input.op.topicId]: {
            ...member,
            collapsed: nextCollapsed
          }
        }
      }
    }
  }
  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createMindmapStructureDelta([input.op.id])
    ),
    footprint: [
      fieldKey('mindmap', input.op.id, 'structure')
    ],
    history: {
      inverse: [{
        type: 'mindmap.topic.collapse',
        id: input.op.id,
        topicId: input.op.topicId,
        collapsed: member.collapsed
      }]
    }
  })
}

const reduceCanvasOrderMove = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'canvas.order.move' }>
  >
): CustomResult | void => {
  const currentOrder = input.reader.canvas.order()
  const nextOrder = moveCanvasOrder(currentOrder, input.op.refs, input.op.to)
  if (same(nextOrder, currentOrder)) {
    return
  }

  return createWhiteboardCustomResult({
    document: {
      ...input.document,
      canvas: {
        ...input.document.canvas,
        order: nextOrder as CanvasItemRef[]
      }
    },
    delta: mergeDelta(
      createCanvasOrderDelta()
    ),
    footprint: [
      fieldKey('document', 'document', 'canvas.order')
    ],
    history: {
      inverse: [{
        type: 'canvas.order.move',
        refs: input.op.refs.map((ref) => cloneCanvasRef(ref)!),
        to: readCanvasPreviousTo(currentOrder, input.op.refs)
      }]
    }
  })
}

const reduceEdgeLabelInsert = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'edge.label.insert' }>
  >
): CustomResult => {
  const current = input.reader.edges.get(input.op.edgeId)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Edge ${input.op.edgeId} not found.`
    })
  }

  const labels = insertOrderedItem(
    getLabels(current),
    clone(input.op.label)!,
    toOrderedAnchor(input.op.to),
    (label) => label.id
  )
  const next: Document = {
    ...input.document,
    edges: {
      ...input.document.edges,
      [input.op.edgeId]: {
        ...current,
        labels: labels as EdgeLabel[]
      }
    }
  }

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createEdgeLabelsDelta([input.op.edgeId])
    ),
    footprint: [
      relationKey('edge', input.op.edgeId, 'labels'),
      relationKey('edge', input.op.edgeId, 'labels', input.op.label.id)
    ],
    history: {
      inverse: [{
        type: 'edge.label.delete',
        edgeId: input.op.edgeId,
        labelId: input.op.label.id
      }]
    }
  })
}

const reduceEdgeLabelDelete = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'edge.label.delete' }>
  >
): CustomResult | void => {
  const current = input.reader.edges.get(input.op.edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === input.op.labelId)
  if (!current || index < 0) {
    return
  }

  const label = labels[index]!
  const next: Document = {
    ...input.document,
    edges: {
      ...input.document.edges,
      [input.op.edgeId]: {
        ...current,
        labels: labels.filter((entry) => entry.id !== input.op.labelId)
      }
    }
  }

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createEdgeLabelsDelta([input.op.edgeId])
    ),
    footprint: [
      relationKey('edge', input.op.edgeId, 'labels'),
      relationKey('edge', input.op.edgeId, 'labels', input.op.labelId)
    ],
    history: {
      inverse: [{
        type: 'edge.label.insert',
        edgeId: input.op.edgeId,
        label: clone(label)!,
        to: readLabelAnchorFromIndex(labels, index)
      }]
    }
  })
}

const reduceEdgeLabelMove = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'edge.label.move' }>
  >
): CustomResult | void => {
  const current = input.reader.edges.get(input.op.edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === input.op.labelId)
  if (!current || index < 0) {
    return
  }

  const nextLabels = moveOrderedItem(
    labels,
    input.op.labelId,
    toOrderedAnchor(input.op.to),
    (label) => label.id
  )
  if (same(nextLabels, labels)) {
    return
  }

  const next: Document = {
    ...input.document,
    edges: {
      ...input.document.edges,
      [input.op.edgeId]: {
        ...current,
        labels: nextLabels as EdgeLabel[]
      }
    }
  }

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createEdgeLabelsDelta([input.op.edgeId])
    ),
    footprint: [
      relationKey('edge', input.op.edgeId, 'labels'),
      relationKey('edge', input.op.edgeId, 'labels', input.op.labelId)
    ],
    history: {
      inverse: [{
        type: 'edge.label.move',
        edgeId: input.op.edgeId,
        labelId: input.op.labelId,
        to: readLabelAnchorFromIndex(labels, index)
      }]
    }
  })
}

const reduceEdgeLabelPatch = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'edge.label.patch' }>
  >
): CustomResult => {
  const current = input.reader.edges.get(input.op.edgeId)
  const labels = current
    ? [...getLabels(current)]
    : []
  const index = labels.findIndex((label) => label.id === input.op.labelId)
  if (!current || index < 0) {
    return input.fail({
      code: 'invalid',
      message: `Edge label ${input.op.labelId} not found.`
    })
  }

  const label = labels[index]!
  const update = readEdgeLabelUpdateFromPatch(input.op.patch)
  const inverseFields: EdgeLabelFieldPatch = {}
  if (update.fields) {
    if (hasOwn(update.fields, 'text')) {
      inverseFields.text = clone(label.text)
    }
    if (hasOwn(update.fields, 't')) {
      inverseFields.t = clone(label.t)
    }
    if (hasOwn(update.fields, 'offset')) {
      inverseFields.offset = clone(label.offset)
    }
  }
  const inverseRecord = update.record
    ? draftRecord.inverse(label, update.record)
    : undefined

  let nextLabel = clone(label)!
  if (update.fields) {
    if (hasOwn(update.fields, 'text')) {
      nextLabel.text = clone(update.fields.text)
    }
    if (hasOwn(update.fields, 't')) {
      nextLabel.t = clone(update.fields.t)
    }
    if (hasOwn(update.fields, 'offset')) {
      nextLabel.offset = clone(update.fields.offset)
    }
  }
  if (update.record) {
    nextLabel = draftRecord.apply(nextLabel, update.record)
  }
  labels[index] = nextLabel
  const next: Document = {
    ...input.document,
    edges: {
      ...input.document.edges,
      [input.op.edgeId]: {
        ...current,
        labels: labels as EdgeLabel[]
      }
    }
  }

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createEdgeLabelsDelta([input.op.edgeId])
    ),
    footprint: [
      relationKey('edge', input.op.edgeId, 'labels'),
      relationKey('edge', input.op.edgeId, 'labels', input.op.labelId)
    ],
    history: {
      inverse: [{
        type: 'edge.label.patch',
        edgeId: input.op.edgeId,
        labelId: input.op.labelId,
        patch: createEdgeLabelPatch({
          ...(Object.keys(inverseFields).length
            ? { fields: inverseFields }
            : {}),
          ...(inverseRecord && Object.keys(inverseRecord).length
            ? { record: inverseRecord }
            : {})
        })
      }]
    }
  })
}

const reduceEdgeRoutePointInsert = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'edge.route.point.insert' }>
  >
): CustomResult => {
  const current = input.reader.edges.get(input.op.edgeId)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Edge ${input.op.edgeId} not found.`
    })
  }

  const points = insertOrderedItem(
    getManualRoutePoints(current),
    clone(input.op.point)!,
    toOrderedAnchor(input.op.to),
    (point) => point.id
  )
  const next: Document = {
    ...input.document,
    edges: {
      ...input.document.edges,
      [input.op.edgeId]: {
        ...current,
        route: {
          kind: 'manual',
          points: points as EdgeRoutePoint[]
        }
      }
    }
  }

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createEdgeRouteDelta([input.op.edgeId])
    ),
    footprint: [
      relationKey('edge', input.op.edgeId, 'route'),
      relationKey('edge', input.op.edgeId, 'route', input.op.point.id)
    ],
    history: {
      inverse: [{
        type: 'edge.route.point.delete',
        edgeId: input.op.edgeId,
        pointId: input.op.point.id
      }]
    }
  })
}

const reduceEdgeRoutePointDelete = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'edge.route.point.delete' }>
  >
): CustomResult | void => {
  const current = input.reader.edges.get(input.op.edgeId)
  const points = current
    ? [...getManualRoutePoints(current)]
    : []
  const index = points.findIndex((point) => point.id === input.op.pointId)
  if (!current || index < 0) {
    return
  }

  const point = points[index]!
  const nextPoints = points.filter((entry) => entry.id !== input.op.pointId)
  const next: Document = {
    ...input.document,
    edges: {
      ...input.document.edges,
      [input.op.edgeId]: {
        ...current,
        route: nextPoints.length > 0
          ? {
              kind: 'manual',
              points: nextPoints
            }
          : {
              kind: 'auto'
            }
      }
    }
  }

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createEdgeRouteDelta([input.op.edgeId])
    ),
    footprint: [
      relationKey('edge', input.op.edgeId, 'route'),
      relationKey('edge', input.op.edgeId, 'route', input.op.pointId)
    ],
    history: {
      inverse: [{
        type: 'edge.route.point.insert',
        edgeId: input.op.edgeId,
        point: clone(point)!,
        to: readPointAnchorFromIndex(points, index)
      }]
    }
  })
}

const reduceEdgeRoutePointMove = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'edge.route.point.move' }>
  >
): CustomResult | void => {
  const current = input.reader.edges.get(input.op.edgeId)
  const points = current
    ? [...getManualRoutePoints(current)]
    : []
  const index = points.findIndex((point) => point.id === input.op.pointId)
  if (!current || index < 0) {
    return
  }

  const nextPoints = moveOrderedItem(
    points,
    input.op.pointId,
    toOrderedAnchor(input.op.to),
    (point) => point.id
  )
  if (same(nextPoints, points)) {
    return
  }

  const next: Document = {
    ...input.document,
    edges: {
      ...input.document.edges,
      [input.op.edgeId]: {
        ...current,
        route: {
          kind: 'manual',
          points: nextPoints as EdgeRoutePoint[]
        }
      }
    }
  }

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createEdgeRouteDelta([input.op.edgeId])
    ),
    footprint: [
      relationKey('edge', input.op.edgeId, 'route'),
      relationKey('edge', input.op.edgeId, 'route', input.op.pointId)
    ],
    history: {
      inverse: [{
        type: 'edge.route.point.move',
        edgeId: input.op.edgeId,
        pointId: input.op.pointId,
        to: readPointAnchorFromIndex(points, index)
      }]
    }
  })
}

const reduceEdgeRoutePointPatch = (
  input: WhiteboardCustomReduceContext<
    Extract<WhiteboardCustomOperation, { type: 'edge.route.point.patch' }>
  >
): CustomResult => {
  const current = input.reader.edges.get(input.op.edgeId)
  const points = current
    ? [...getManualRoutePoints(current)]
    : []
  const index = points.findIndex((point) => point.id === input.op.pointId)
  if (!current || index < 0) {
    return input.fail({
      code: 'invalid',
      message: `Edge route point ${input.op.pointId} not found.`
    })
  }

  const point = points[index]!
  const inverse: Partial<Record<'x' | 'y', number>> = {}
  if (hasOwn(input.op.patch, 'x')) {
    inverse.x = point.x
  }
  if (hasOwn(input.op.patch, 'y')) {
    inverse.y = point.y
  }
  points[index] = {
    ...point,
    ...(hasOwn(input.op.patch, 'x') ? { x: input.op.patch.x! } : {}),
    ...(hasOwn(input.op.patch, 'y') ? { y: input.op.patch.y! } : {})
  }
  const next: Document = {
    ...input.document,
    edges: {
      ...input.document.edges,
      [input.op.edgeId]: {
        ...current,
        route: {
          kind: 'manual',
          points
        }
      }
    }
  }

  return createWhiteboardCustomResult({
    document: next,
    delta: mergeDelta(
      createEdgeRouteDelta([input.op.edgeId])
    ),
    footprint: [
      relationKey('edge', input.op.edgeId, 'route', input.op.pointId)
    ],
    history: {
      inverse: [{
        type: 'edge.route.point.patch',
        edgeId: input.op.edgeId,
        pointId: input.op.pointId,
        patch: inverse
      }]
    }
  })
}

export const whiteboardCustom: MutationCustomTable<
  Document,
  Operation,
  DocumentReader,
  WhiteboardCompileServices,
  WhiteboardCustomCode
> = {
  'canvas.order.move': {
    reduce: reduceCanvasOrderMove
  },
  'edge.label.insert': {
    reduce: reduceEdgeLabelInsert
  },
  'edge.label.delete': {
    reduce: reduceEdgeLabelDelete
  },
  'edge.label.move': {
    reduce: reduceEdgeLabelMove
  },
  'edge.label.patch': {
    reduce: reduceEdgeLabelPatch
  },
  'edge.route.point.insert': {
    reduce: reduceEdgeRoutePointInsert
  },
  'edge.route.point.delete': {
    reduce: reduceEdgeRoutePointDelete
  },
  'edge.route.point.move': {
    reduce: reduceEdgeRoutePointMove
  },
  'edge.route.point.patch': {
    reduce: reduceEdgeRoutePointPatch
  },
  'mindmap.create': {
    reduce: ({ op, document }) => createMindmapResult({
      op,
      document
    })
  },
  'mindmap.restore': {
    reduce: ({ op, document }) => createMindmapRestoreResult({
      op,
      document
    })
  },
  'mindmap.delete': {
    reduce: ({ op, document }) => createMindmapDeleteResult({
      op,
      document
    })
  },
  'mindmap.move': {
    reduce: ({ op, document, fail }) => createMindmapMoveResult({
      op,
      document,
      fail
    })
  },
  'mindmap.layout': {
    reduce: ({ op, document, fail }) => createMindmapLayoutResult({
      op,
      document,
      fail
    })
  },
  'mindmap.topic.insert': {
    reduce: ({ op, document, fail }) => createMindmapTopicInsertResult({
      op,
      document,
      fail
    })
  },
  'mindmap.topic.restore': {
    reduce: ({ op, document, fail }) => createMindmapTopicRestoreResult({
      op,
      document,
      fail
    })
  },
  'mindmap.topic.move': {
    reduce: ({ op, document, fail }) => createMindmapTopicMoveResult({
      op,
      document,
      fail
    })
  },
  'mindmap.topic.delete': {
    reduce: ({ op, document, fail }) => createMindmapTopicDeleteResult({
      op,
      document,
      fail
    })
  },
  'mindmap.topic.patch': {
    reduce: ({ op, document, fail }) => createMindmapTopicPatchResult({
      op,
      document,
      fail
    })
  },
  'mindmap.branch.patch': {
    reduce: ({ op, document, fail }) => createMindmapBranchPatchResult({
      op,
      document,
      fail
    })
  },
  'mindmap.topic.collapse': {
    reduce: ({ op, document, fail }) => createMindmapTopicCollapseResult({
      op,
      document,
      fail
    })
  }
} as const
