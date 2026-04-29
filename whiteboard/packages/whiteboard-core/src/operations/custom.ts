import {
  equal,
  json
} from '@shared/core'
import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import type {
  MutationCustomReduceInput,
  MutationCustomTable,
  MutationDeltaInput,
  MutationFootprint
} from '@shared/mutation'
import {
  createEdgeLabelPatch,
  readEdgeLabelUpdateFromPatch
} from '@whiteboard/core/edge/update'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  createMindmapTopicPatch,
  readMindmapTopicUpdateFromPatch
} from '@whiteboard/core/mindmap/ops'
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

type WhiteboardCustomOperation = Exclude<
  Operation,
  | { type: 'document.create' }
  | { type: 'document.patch' }
  | { type: 'node.create' }
  | { type: 'node.patch' }
  | { type: 'node.delete' }
  | { type: 'edge.create' }
  | { type: 'edge.patch' }
  | { type: 'edge.delete' }
  | { type: 'group.create' }
  | { type: 'group.patch' }
  | { type: 'group.delete' }
>

type WhiteboardCustomCode = ResultCode

type CustomHistory = {
  inverse: readonly Operation[]
  forward?: readonly Operation[]
}

type CustomResult = {
  document: Document
  delta: MutationDeltaInput
  footprint: readonly MutationFootprint[]
  history: CustomHistory
}

type EntityDeltaInput = {
  created?: readonly string[]
  deleted?: readonly string[]
  touched?: readonly string[]
}

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const same = (
  left: unknown,
  right: unknown
): boolean => equal.sameJsonValue(left, right)

const clone = <T,>(
  value: T
): T => value === undefined
  ? value
  : json.clone(value)

const uniqueSorted = (
  ids: Iterable<string>
): readonly string[] => [...new Set(ids)].sort()

const entityKey = (
  family: string,
  id: string
): MutationFootprint => ({
  kind: 'entity',
  family,
  id
})

const fieldKey = (
  family: string,
  id: string,
  field: string
): MutationFootprint => ({
  kind: 'field',
  family,
  id,
  field
})

const recordKey = (
  family: string,
  id: string,
  scope: string,
  path: string
): MutationFootprint => ({
  kind: 'record',
  family,
  id,
  scope,
  path
})

const relationKey = (
  family: string,
  id: string,
  relation: string,
  target?: string
): MutationFootprint => ({
  kind: 'relation',
  family,
  id,
  relation,
  ...(target === undefined ? {} : { target })
})

const appendIdsChange = (
  delta: MutationDeltaInput,
  key: string,
  ids: readonly string[]
): void => {
  if (!ids.length) {
    return
  }

  delta.changes ??= {}
  delta.changes[key] = ids
}

const appendFlagChange = (
  delta: MutationDeltaInput,
  key: string
): void => {
  delta.changes ??= {}
  delta.changes[key] = true
}

const appendUpdatedChange = (
  delta: MutationDeltaInput,
  key: string,
  ids: ReadonlySet<string>
): void => {
  appendIdsChange(delta, key, [...ids].sort())
}

const nodeGeometryChanged = (
  before: Node,
  after: Node
): boolean => (
  !same(before.position, after.position)
  || !same(before.size, after.size)
  || !same(before.rotation, after.rotation)
)

const nodeOwnerChanged = (
  before: Node,
  after: Node
): boolean => (
  !same(before.groupId, after.groupId)
  || !same(before.owner, after.owner)
)

const nodeContentChanged = (
  before: Node,
  after: Node
): boolean => (
  !same(before.type, after.type)
  || !same(before.locked, after.locked)
  || !same(before.data, after.data)
  || !same(before.style, after.style)
)

const edgeEndpointsChanged = (
  before: Edge,
  after: Edge
): boolean => (
  !same(before.source, after.source)
  || !same(before.target, after.target)
  || !same(before.type, after.type)
  || !same(before.locked, after.locked)
  || !same(before.groupId, after.groupId)
  || !same(before.textMode, after.textMode)
)

const edgeRouteChanged = (
  before: Edge,
  after: Edge
): boolean => !same(before.route, after.route)

const edgeStyleChanged = (
  before: Edge,
  after: Edge
): boolean => !same(before.style, after.style)

const edgeLabelsChanged = (
  before: Edge,
  after: Edge
): boolean => !same(before.labels, after.labels)

const edgeDataChanged = (
  before: Edge,
  after: Edge
): boolean => !same(before.data, after.data)

const mindmapStructureChanged = (
  before: MindmapRecord,
  after: MindmapRecord
): boolean => (
  !same(before.root, after.root)
  || !same(before.members, after.members)
  || !same(before.children, after.children)
)

const mindmapLayoutChanged = (
  before: MindmapRecord,
  after: MindmapRecord
): boolean => !same(before.layout, after.layout)

const buildCustomDelta = (input: {
  before: Document
  after: Document
  canvasOrder?: boolean
  nodes?: EntityDeltaInput
  edges?: EntityDeltaInput
  groups?: EntityDeltaInput
  mindmaps?: EntityDeltaInput
}): MutationDeltaInput => {
  const delta: MutationDeltaInput = {
    changes: {}
  }

  if (input.canvasOrder) {
    appendFlagChange(delta, 'canvas.order')
  }

  const nodeCreated = uniqueSorted(input.nodes?.created ?? [])
  const nodeDeleted = uniqueSorted(input.nodes?.deleted ?? [])
  const edgeCreated = uniqueSorted(input.edges?.created ?? [])
  const edgeDeleted = uniqueSorted(input.edges?.deleted ?? [])
  const groupCreated = uniqueSorted(input.groups?.created ?? [])
  const groupDeleted = uniqueSorted(input.groups?.deleted ?? [])
  const mindmapCreated = uniqueSorted(input.mindmaps?.created ?? [])
  const mindmapDeleted = uniqueSorted(input.mindmaps?.deleted ?? [])

  appendIdsChange(delta, 'node.create', nodeCreated)
  appendIdsChange(delta, 'node.delete', nodeDeleted)
  appendIdsChange(delta, 'edge.create', edgeCreated)
  appendIdsChange(delta, 'edge.delete', edgeDeleted)
  appendIdsChange(delta, 'group.create', groupCreated)
  appendIdsChange(delta, 'group.delete', groupDeleted)
  appendIdsChange(delta, 'mindmap.create', mindmapCreated)
  appendIdsChange(delta, 'mindmap.delete', mindmapDeleted)

  const nodeGeometry = new Set<string>()
  const nodeOwner = new Set<string>()
  const nodeContent = new Set<string>()
  uniqueSorted(input.nodes?.touched ?? []).forEach((id) => {
    const beforeNode = input.before.nodes[id]
    const afterNode = input.after.nodes[id]
    if (!beforeNode || !afterNode) {
      return
    }
    if (nodeGeometryChanged(beforeNode, afterNode)) {
      nodeGeometry.add(id)
    }
    if (nodeOwnerChanged(beforeNode, afterNode)) {
      nodeOwner.add(id)
    }
    if (nodeContentChanged(beforeNode, afterNode)) {
      nodeContent.add(id)
    }
  })
  appendUpdatedChange(delta, 'node.geometry', nodeGeometry)
  appendUpdatedChange(delta, 'node.owner', nodeOwner)
  appendUpdatedChange(delta, 'node.content', nodeContent)

  const edgeEndpoints = new Set<string>()
  const edgeRoute = new Set<string>()
  const edgeStyle = new Set<string>()
  const edgeLabels = new Set<string>()
  const edgeData = new Set<string>()
  uniqueSorted(input.edges?.touched ?? []).forEach((id) => {
    const beforeEdge = input.before.edges[id]
    const afterEdge = input.after.edges[id]
    if (!beforeEdge || !afterEdge) {
      return
    }
    if (edgeEndpointsChanged(beforeEdge, afterEdge)) {
      edgeEndpoints.add(id)
    }
    if (edgeRouteChanged(beforeEdge, afterEdge)) {
      edgeRoute.add(id)
    }
    if (edgeStyleChanged(beforeEdge, afterEdge)) {
      edgeStyle.add(id)
    }
    if (edgeLabelsChanged(beforeEdge, afterEdge)) {
      edgeLabels.add(id)
    }
    if (edgeDataChanged(beforeEdge, afterEdge)) {
      edgeData.add(id)
    }
  })
  appendUpdatedChange(delta, 'edge.endpoints', edgeEndpoints)
  appendUpdatedChange(delta, 'edge.route', edgeRoute)
  appendUpdatedChange(delta, 'edge.style', edgeStyle)
  appendUpdatedChange(delta, 'edge.labels', edgeLabels)
  appendUpdatedChange(delta, 'edge.data', edgeData)

  const mindmapStructure = new Set<string>()
  const mindmapLayout = new Set<string>()
  uniqueSorted(input.mindmaps?.touched ?? []).forEach((id) => {
    const beforeMindmap = input.before.mindmaps[id]
    const afterMindmap = input.after.mindmaps[id]
    if (!beforeMindmap || !afterMindmap) {
      return
    }
    if (mindmapStructureChanged(beforeMindmap, afterMindmap)) {
      mindmapStructure.add(id)
    }
    if (mindmapLayoutChanged(beforeMindmap, afterMindmap)) {
      mindmapLayout.add(id)
    }
  })
  appendUpdatedChange(delta, 'mindmap.structure', mindmapStructure)
  appendUpdatedChange(delta, 'mindmap.layout', mindmapLayout)

  if (!Object.keys(delta.changes ?? {}).length) {
    return {}
  }

  return delta
}

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

const readNode = (
  document: Document,
  id: NodeId
): Node | undefined => document.nodes[id]

const readEdge = (
  document: Document,
  id: EdgeId
): Edge | undefined => document.edges[id]

const readMindmap = (
  document: Document,
  id: MindmapId
): MindmapRecord | undefined => document.mindmaps[id]

const readMindmapTree = (
  document: Document,
  id: MindmapId
) => {
  const record = readMindmap(document, id)
  return record
    ? mindmapApi.tree.fromRecord(record)
    : undefined
}

const readMindmapSubtreeNodeIds = (
  document: Document,
  id: MindmapId,
  rootId?: NodeId
): readonly NodeId[] => {
  const tree = readMindmapTree(document, id)
  const record = readMindmap(document, id)
  if (!tree || !record) {
    return []
  }
  return mindmapApi.tree.subtreeIds(tree, rootId ?? record.root)
}

const collectConnectedEdges = (
  document: Document,
  nodeIds: ReadonlySet<NodeId>
): readonly Edge[] => Object.values(document.edges).filter((edge) => (
  (edge.source.kind === 'node' && nodeIds.has(edge.source.nodeId))
  || (edge.target.kind === 'node' && nodeIds.has(edge.target.nodeId))
))

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

const reconcileMindmap = (
  document: Document,
  id: MindmapId
): {
  document: Document
  nodeIds: readonly NodeId[]
} => {
  const record = readMindmap(document, id)
  const tree = readMindmapTree(document, id)
  if (!record || !tree) {
    return {
      document,
      nodeIds: []
    }
  }

  const root = readNode(document, record.root)
  if (!root) {
    return {
      document,
      nodeIds: []
    }
  }

  const computed = mindmapApi.layout.compute(
    tree,
    (nodeId) => {
      const node = readNode(document, nodeId)
      return {
        width: Math.max(node?.size?.width ?? 1, 1),
        height: Math.max(node?.size?.height ?? 1, 1)
      }
    },
    tree.layout
  )
  const anchored = mindmapApi.layout.anchor({
    tree,
    computed,
    position: root.position
  })

  return {
    document,
    nodeIds: Object.keys(anchored.node) as readonly NodeId[]
  }
}

const createMindmapSnapshot = (
  document: Document,
  id: MindmapId
): MindmapSnapshot => {
  const mindmap = readMindmap(document, id)
  const tree = readMindmapTree(document, id)
  if (!mindmap || !tree) {
    throw new Error(`Mindmap ${id} not found.`)
  }

  const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, tree.rootNodeId))
  return {
    mindmap: clone(mindmap)!,
    nodes: [...nodeIds].flatMap((nodeId) => {
      const node = readNode(document, nodeId)
      return node
        ? [clone(node)!]
        : []
    }),
    slot: readCanvasSlot(document.canvas.order, {
      kind: 'mindmap',
      id
    })
  }
}

const createMindmapTopicSnapshot = (
  document: Document,
  id: MindmapId,
  rootId: NodeId
): MindmapTopicSnapshot => {
  const current = readMindmap(document, id)
  const tree = readMindmapTree(document, id)
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
  const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, rootId))

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
      const node = readNode(document, nodeId)
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
  const next = reconcileMindmap(nextBase, input.op.mindmap.id).document

  return {
    document: next,
    delta: buildCustomDelta({
      before,
      after: next,
      canvasOrder: true,
      nodes: {
        created: input.op.nodes.map((node) => node.id)
      },
      mindmaps: {
        created: [input.op.mindmap.id]
      }
    }),
    footprint: [
      entityKey('mindmap', input.op.mindmap.id),
      ...input.op.nodes.map((node) => entityKey('node', node.id))
    ],
    history: {
      inverse: [{
        type: 'mindmap.delete',
        id: input.op.mindmap.id
      }]
    }
  }
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
  const next = reconcileMindmap(nextBase, input.op.snapshot.mindmap.id).document

  return {
    document: next,
    delta: buildCustomDelta({
      before,
      after: next,
      canvasOrder: true,
      nodes: {
        created: input.op.snapshot.nodes.map((node) => node.id)
      },
      mindmaps: {
        created: [input.op.snapshot.mindmap.id]
      }
    }),
    footprint: [
      entityKey('mindmap', input.op.snapshot.mindmap.id),
      ...input.op.snapshot.nodes.map((node) => entityKey('node', node.id))
    ],
    history: {
      inverse: [{
        type: 'mindmap.delete',
        id: input.op.snapshot.mindmap.id
      }]
    }
  }
}

const createMindmapDeleteResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.delete' }>
    document: Document
  }
): CustomResult | void => {
  const current = readMindmap(input.document, input.op.id)
  const tree = readMindmapTree(input.document, input.op.id)
  if (!current || !tree) {
    return
  }

  const before = input.document
  const snapshot = createMindmapSnapshot(before, input.op.id)
  const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, tree.rootNodeId))
  const connectedEdges = collectConnectedEdges(before, nodeIds)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before,
      after: next,
      canvasOrder: true,
      nodes: {
        deleted: [...nodeIds]
      },
      edges: {
        deleted: edgeIds
      },
      mindmaps: {
        deleted: [input.op.id]
      }
    }),
    footprint: [
      entityKey('mindmap', input.op.id),
      ...[...nodeIds].map((nodeId) => entityKey('node', nodeId)),
      ...edgeIds.map((edgeId) => entityKey('edge', edgeId))
    ],
    history: {
      inverse
    }
  }
}

const createMindmapMoveResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.move' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult => {
  const current = readMindmap(input.document, input.op.id)
  const root = current
    ? readNode(input.document, current.root)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      nodes: {
        touched: relayout.nodeIds
      }
    }),
    footprint: [
      fieldKey('mindmap', input.op.id, 'layout')
    ],
    history: {
      inverse: [{
        type: 'mindmap.move',
        id: input.op.id,
        position: clone(root.position)!
      }]
    }
  }
}

const createMindmapLayoutResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.layout' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult => {
  const current = readMindmap(input.document, input.op.id)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      nodes: {
        touched: relayout.nodeIds
      },
      mindmaps: {
        touched: [input.op.id]
      }
    }),
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
  }
}

const createMindmapTopicInsertResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.insert' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult => {
  const current = readMindmap(input.document, input.op.id)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      nodes: {
        created: [input.op.node.id],
        touched: relayout.nodeIds
      },
      mindmaps: {
        touched: [input.op.id]
      }
    }),
    footprint: [
      fieldKey('mindmap', input.op.id, 'structure'),
      entityKey('node', input.op.node.id)
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
  }
}

const createMindmapTopicRestoreResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.restore' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult => {
  const current = readMindmap(input.document, input.op.id)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      nodes: {
        created: input.op.snapshot.nodes.map((node) => node.id),
        touched: relayout.nodeIds
      },
      mindmaps: {
        touched: [input.op.id]
      }
    }),
    footprint: [
      fieldKey('mindmap', input.op.id, 'structure'),
      ...input.op.snapshot.nodes.map((node) => entityKey('node', node.id))
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
  }
}

const createMindmapTopicMoveResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.move' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult => {
  const current = readMindmap(input.document, input.op.id)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      nodes: {
        touched: relayout.nodeIds
      },
      mindmaps: {
        touched: [input.op.id]
      }
    }),
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
  }
}

const createMindmapTopicDeleteResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.delete' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult => {
  const current = readMindmap(input.document, input.op.id)
  const tree = readMindmapTree(input.document, input.op.id)
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
  const snapshot = createMindmapTopicSnapshot(before, input.op.id, input.op.input.nodeId)
  const nodeIds = new Set(mindmapApi.tree.subtreeIds(tree, input.op.input.nodeId))
  const connectedEdges = collectConnectedEdges(before, nodeIds)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

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

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      canvasOrder: edgeIds.length > 0,
      nodes: {
        deleted: [...nodeIds],
        touched: relayout.nodeIds
      },
      edges: {
        deleted: edgeIds
      },
      mindmaps: {
        touched: [input.op.id]
      }
    }),
    footprint: [
      fieldKey('mindmap', input.op.id, 'structure'),
      ...[...nodeIds].map((nodeId) => entityKey('node', nodeId)),
      ...edgeIds.map((edgeId) => entityKey('edge', edgeId))
    ],
    history: {
      inverse
    }
  }
}

const createMindmapTopicPatchResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.patch' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult => {
  const current = readNode(input.document, input.op.topicId)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

  const footprint: MutationFootprint[] = [
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

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      nodes: {
        touched: uniqueSorted([
          input.op.topicId,
          ...relayout.nodeIds
        ])
      }
    }),
    footprint,
    history: {
      inverse: [{
        type: 'mindmap.topic.patch',
        id: input.op.id,
        topicId: input.op.topicId,
        patch: createMindmapTopicPatch(inverse.update)
      }]
    }
  }
}

const createMindmapBranchPatchResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.branch.patch' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult | void => {
  const current = readMindmap(input.document, input.op.id)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      nodes: {
        touched: relayout.nodeIds
      },
      mindmaps: {
        touched: [input.op.id]
      }
    }),
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
  }
}

const createMindmapTopicCollapseResult = (
  input: {
    op: Extract<WhiteboardCustomOperation, { type: 'mindmap.topic.collapse' }>
    document: Document
    fail: MutationCustomReduceInput<Document, WhiteboardCustomOperation, WhiteboardCompileServices, WhiteboardCustomCode>['fail']
  }
): CustomResult => {
  const current = readMindmap(input.document, input.op.id)
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
  const relayout = reconcileMindmap(nextBase, input.op.id)

  return {
    document: relayout.document,
    delta: buildCustomDelta({
      before,
      after: relayout.document,
      nodes: {
        touched: relayout.nodeIds
      },
      mindmaps: {
        touched: [input.op.id]
      }
    }),
    footprint: [
      fieldKey('mindmap', input.op.id, 'layout')
    ],
    history: {
      inverse: [{
        type: 'mindmap.topic.collapse',
        id: input.op.id,
        topicId: input.op.topicId,
        collapsed: member.collapsed
      }]
    }
  }
}

const reduceCanvasOrderMove = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'canvas.order.move' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult | void => {
  const nextOrder = moveCanvasOrder(input.document.canvas.order, input.op.refs, input.op.to)
  if (same(nextOrder, input.document.canvas.order)) {
    return
  }

  return {
    document: {
      ...input.document,
      canvas: {
        ...input.document.canvas,
        order: nextOrder as CanvasItemRef[]
      }
    },
    delta: {
      changes: {
        'canvas.order': true
      }
    },
    footprint: [
      fieldKey('document', 'document', 'canvas.order')
    ],
    history: {
      inverse: [{
        type: 'canvas.order.move',
        refs: input.op.refs.map((ref) => cloneCanvasRef(ref)!),
        to: readCanvasPreviousTo(input.document.canvas.order, input.op.refs)
      }]
    }
  }
}

const reduceEdgeLabelInsert = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'edge.label.insert' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult => {
  const current = readEdge(input.document, input.op.edgeId)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before: input.document,
      after: next,
      edges: {
        touched: [input.op.edgeId]
      }
    }),
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
  }
}

const reduceEdgeLabelDelete = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'edge.label.delete' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult | void => {
  const current = readEdge(input.document, input.op.edgeId)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before: input.document,
      after: next,
      edges: {
        touched: [input.op.edgeId]
      }
    }),
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
  }
}

const reduceEdgeLabelMove = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'edge.label.move' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult | void => {
  const current = readEdge(input.document, input.op.edgeId)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before: input.document,
      after: next,
      edges: {
        touched: [input.op.edgeId]
      }
    }),
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
  }
}

const reduceEdgeLabelPatch = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'edge.label.patch' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult => {
  const current = readEdge(input.document, input.op.edgeId)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before: input.document,
      after: next,
      edges: {
        touched: [input.op.edgeId]
      }
    }),
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
  }
}

const reduceEdgeRoutePointInsert = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'edge.route.point.insert' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult => {
  const current = readEdge(input.document, input.op.edgeId)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before: input.document,
      after: next,
      edges: {
        touched: [input.op.edgeId]
      }
    }),
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
  }
}

const reduceEdgeRoutePointDelete = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'edge.route.point.delete' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult | void => {
  const current = readEdge(input.document, input.op.edgeId)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before: input.document,
      after: next,
      edges: {
        touched: [input.op.edgeId]
      }
    }),
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
  }
}

const reduceEdgeRoutePointMove = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'edge.route.point.move' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult | void => {
  const current = readEdge(input.document, input.op.edgeId)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before: input.document,
      after: next,
      edges: {
        touched: [input.op.edgeId]
      }
    }),
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
  }
}

const reduceEdgeRoutePointPatch = (
  input: MutationCustomReduceInput<
    Document,
    Extract<WhiteboardCustomOperation, { type: 'edge.route.point.patch' }>,
    WhiteboardCompileServices,
    WhiteboardCustomCode
  >
): CustomResult => {
  const current = readEdge(input.document, input.op.edgeId)
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

  return {
    document: next,
    delta: buildCustomDelta({
      before: input.document,
      after: next,
      edges: {
        touched: [input.op.edgeId]
      }
    }),
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
  }
}

export const whiteboardCustom: MutationCustomTable<
  Document,
  Operation,
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
