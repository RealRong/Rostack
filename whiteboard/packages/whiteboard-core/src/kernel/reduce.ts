import { validateLockOperations } from '@whiteboard/core/lock'
import {
  anchorMindmapLayout,
  computeMindmapLayout,
  toMindmapTree,
  getSubtreeIds
} from '@whiteboard/core/mindmap'
import { createOverlayTable, type OverlayTable } from '@whiteboard/core/kernel/overlay'
import { err, ok } from '@whiteboard/core/result'
import type {
  CanvasItemRef,
  ChangeIds,
  ChangeSet,
  Document,
  Edge,
  EdgeAnchor,
  EdgeLabelStyle,
  EdgeId,
  Group,
  GroupId,
  Invalidation,
  KernelContext,
  KernelReadImpact,
  KernelReduceResult,
  MindmapLayoutSpec,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
  NodePatch,
  Operation
} from '@whiteboard/core/types'
import { cloneValue } from '@whiteboard/core/value'

const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_EDGE_IDS: readonly EdgeId[] = []

const RESET_READ_IMPACT: KernelReadImpact = {
  reset: true,
  document: false,
  node: {
    ids: EMPTY_NODE_IDS,
    geometry: false,
    list: false,
    value: false
  },
  edge: {
    ids: EMPTY_EDGE_IDS,
    nodeIds: EMPTY_NODE_IDS,
    geometry: false,
    list: false,
    value: false
  }
}

const createChangeIds = <Id extends string>(): ChangeIds<Id> => ({
  add: new Set<Id>(),
  update: new Set<Id>(),
  delete: new Set<Id>()
})

const createChangeSet = (): ChangeSet => ({
  document: false,
  background: false,
  canvasOrder: false,
  nodes: createChangeIds<NodeId>(),
  edges: createChangeIds<EdgeId>(),
  groups: createChangeIds<GroupId>(),
  mindmaps: createChangeIds<string>()
})

const createInvalidation = (): Invalidation => ({
  document: false,
  background: false,
  canvasOrder: false,
  nodes: new Set<NodeId>(),
  edges: new Set<EdgeId>(),
  groups: new Set<GroupId>(),
  mindmaps: new Set<string>(),
  projections: new Set<string>()
})

const deriveImpact = (
  invalidation: Invalidation
): KernelReadImpact => {
  const nodeIds = [...invalidation.nodes]
  const edgeIds = [...invalidation.edges]
  const reset = invalidation.document

  return {
    reset,
    document: invalidation.document || invalidation.background,
    node: {
      ids: reset ? EMPTY_NODE_IDS : nodeIds,
      geometry: reset || invalidation.canvasOrder || invalidation.mindmaps.size > 0 || nodeIds.length > 0,
      list: reset || invalidation.canvasOrder,
      value: reset || invalidation.mindmaps.size > 0 || nodeIds.length > 0
    },
    edge: {
      ids: reset ? EMPTY_EDGE_IDS : edgeIds,
      nodeIds: reset ? EMPTY_NODE_IDS : nodeIds,
      geometry: reset || invalidation.canvasOrder || nodeIds.length > 0 || edgeIds.length > 0,
      list: reset || invalidation.canvasOrder,
      value: reset || nodeIds.length > 0 || edgeIds.length > 0
    }
  }
}

const readLockViolationMessage = (
  reason: 'locked-node' | 'locked-edge' | 'locked-relation',
  operation: Operation
) => {
  const action = (
    operation.type === 'node.create'
    || operation.type === 'edge.create'
  )
    ? 'duplicated'
    : 'modified'

  if (reason === 'locked-node') {
    return `Locked nodes cannot be ${action}.`
  }
  if (reason === 'locked-edge') {
    return `Locked edges cannot be ${action}.`
  }
  return `Locked node relations cannot be ${action}.`
}

type ReconcileTask = {
  type: 'mindmap.layout'
  id: string
}

const MAX_RECONCILE_STEPS = 100
const MAX_RECONCILE_REPEAT = 10

const createReconcileQueue = () => {
  const tasks: ReconcileTask[] = []
  const queued = new Set<string>()

  return {
    enqueue: (task: ReconcileTask) => {
      const key = `${task.type}:${task.id}`
      if (queued.has(key)) {
        return
      }
      queued.add(key)
      tasks.push(task)
    },
    drain: (
      run: (task: ReconcileTask) => void
    ) => {
      const repeats = new Map<string, number>()
      let steps = 0

      while (tasks.length > 0) {
        if (steps >= MAX_RECONCILE_STEPS) {
          return err(
            'internal',
            'Reconcile budget exceeded.',
            {
              reason: 'reconcile_budget_exceeded'
            }
          )
        }

        const task = tasks.shift()!
        const key = `${task.type}:${task.id}`
        queued.delete(key)

        const count = (repeats.get(key) ?? 0) + 1
        repeats.set(key, count)
        if (count > MAX_RECONCILE_REPEAT) {
          return err(
            'internal',
            'Reconcile cycle detected.',
            {
              reason: 'reconcile_cycle'
            }
          )
        }

        run(task)
        steps += 1
      }

      return ok(undefined)
    }
  }
}

const markChange = <Id extends string>(
  bucket: ChangeIds<Id>,
  kind: 'add' | 'update' | 'delete',
  id: Id
) => {
  if (kind === 'add') {
    bucket.delete.delete(id)
    bucket.update.delete(id)
    bucket.add.add(id)
    return
  }
  if (kind === 'update') {
    if (!bucket.add.has(id) && !bucket.delete.has(id)) {
      bucket.update.add(id)
    }
    return
  }
  if (bucket.add.delete(id)) {
    bucket.update.delete(id)
    return
  }
  bucket.update.delete(id)
  bucket.delete.add(id)
}

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

const appendCanvasRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
) => (
  order.some((entry) => sameCanvasRef(entry, ref))
    ? [...order]
    : [...order, ref]
)

const removeCanvasRef = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
) => {
  const index = order.findIndex((entry) => sameCanvasRef(entry, ref))
  if (index < 0) return [...order]
  return [
    ...order.slice(0, index),
    ...order.slice(index + 1)
  ]
}

const readCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef
) => {
  const index = order.findIndex((entry) => sameCanvasRef(entry, ref))
  if (index < 0) {
    return undefined
  }
  return {
    prev: order[index - 1],
    next: order[index + 1]
  }
}

const insertCanvasSlot = (
  order: readonly CanvasItemRef[],
  ref: CanvasItemRef,
  slot?: {
    prev?: CanvasItemRef
    next?: CanvasItemRef
  }
) => {
  const filtered = removeCanvasRef(order, ref)
  if (!slot) {
    return appendCanvasRef(filtered, ref)
  }
  if (slot.prev) {
    const index = filtered.findIndex((entry) => sameCanvasRef(entry, slot.prev!))
    if (index >= 0) {
      return [
        ...filtered.slice(0, index + 1),
        ref,
        ...filtered.slice(index + 1)
      ]
    }
  }
  if (slot.next) {
    const index = filtered.findIndex((entry) => sameCanvasRef(entry, slot.next!))
    if (index >= 0) {
      return [
        ...filtered.slice(0, index),
        ref,
        ...filtered.slice(index)
      ]
    }
  }
  return appendCanvasRef(filtered, ref)
}

type DraftDocument = {
  base: Document
  background: Document['background']
  canvasOrder: readonly CanvasItemRef[]
  nodes: OverlayTable<NodeId, Node>
  edges: OverlayTable<EdgeId, Edge>
  groups: OverlayTable<GroupId, Group>
  mindmaps: OverlayTable<MindmapId, MindmapRecord>
}

const createDraftDocument = (
  document: Document
): DraftDocument => ({
  base: document,
  background: document.background,
  canvasOrder: document.canvas.order,
  nodes: createOverlayTable(document.nodes),
  edges: createOverlayTable(document.edges),
  groups: createOverlayTable(document.groups),
  mindmaps: createOverlayTable(document.mindmaps)
})

const materializeDraftDocument = (
  draft: DraftDocument
): Document => ({
  ...draft.base,
  background: draft.background,
  canvas: {
    order: [...draft.canvasOrder]
  },
  nodes: draft.nodes.materialize(),
  edges: draft.edges.materialize(),
  groups: draft.groups.materialize(),
  mindmaps: draft.mindmaps.materialize()
})

const getNode = (
  draft: DraftDocument,
  id: NodeId
): Node | undefined => draft.nodes.get(id)

const getEdge = (
  draft: DraftDocument,
  id: EdgeId
): Edge | undefined => draft.edges.get(id)

const getMindmap = (
  draft: DraftDocument,
  id: MindmapId
): MindmapRecord | undefined => draft.mindmaps.get(id)

const getMindmapTreeFromDraft = (
  draft: DraftDocument,
  id: string
) => {
  const direct = getMindmap(draft, id)
  if (direct) {
    return toMindmapTree(direct)
  }

  const node = getNode(draft, id)
  const mindmapId = node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
  const record = mindmapId
    ? getMindmap(draft, mindmapId)
    : undefined
  return record
    ? toMindmapTree(record)
    : undefined
}

const readCanvasOrder = (
  draft: DraftDocument
): readonly CanvasItemRef[] => draft.canvasOrder

const writeCanvasOrder = (
  draft: DraftDocument,
  order: readonly CanvasItemRef[]
) => {
  draft.canvasOrder = order
}

const isTopLevelNode = (
  draft: DraftDocument,
  node: Node | undefined
) => {
  if (!node) return false
  if (!node.owner) return true
  return getMindmap(draft, node.owner.id)?.root === node.id
}

const setNode = (draft: DraftDocument, node: Node) => {
  draft.nodes.set(node.id, node)
  if (isTopLevelNode(draft, node)) {
    writeCanvasOrder(draft, appendCanvasRef(readCanvasOrder(draft), {
      kind: 'node',
      id: node.id
    }))
  }
}

const deleteNode = (
  draft: DraftDocument,
  nodeId: NodeId
) => {
  draft.nodes.delete(nodeId)
  writeCanvasOrder(draft, removeCanvasRef(readCanvasOrder(draft), {
    kind: 'node',
    id: nodeId
  }))
}

const setEdge = (draft: DraftDocument, edge: Edge) => {
  draft.edges.set(edge.id, edge)
  writeCanvasOrder(draft, appendCanvasRef(readCanvasOrder(draft), {
    kind: 'edge',
    id: edge.id
  }))
}

const deleteEdge = (
  draft: DraftDocument,
  edgeId: EdgeId
) => {
  draft.edges.delete(edgeId)
  writeCanvasOrder(draft, removeCanvasRef(readCanvasOrder(draft), {
    kind: 'edge',
    id: edgeId
  }))
}

const relayoutMindmap = (
  draft: DraftDocument,
  id: string
) => {
  const record = getMindmap(draft, id)
  const tree = getMindmapTreeFromDraft(draft, id)
  if (!record || !tree) return

  const root = getNode(draft, record.root)
  if (!root) return

  const layout = computeMindmapLayout(
    tree,
    (nodeId) => {
      const node = getNode(draft, nodeId)
      return {
        width: Math.max(node?.size?.width ?? 1, 1),
        height: Math.max(node?.size?.height ?? 1, 1)
      }
    },
    tree.layout
  )
  const anchored = anchorMindmapLayout({
    tree,
    computed: layout,
    position: root.position
  })

  Object.entries(anchored.node).forEach(([nodeId, rect]) => {
    const current = getNode(draft, nodeId)
    if (!current) return
    draft.nodes.set(nodeId, {
      ...current,
      position: {
        x: rect.x,
        y: rect.y
      },
      size: {
        width: rect.width,
        height: rect.height
      }
    })
  })
}

const collectConnectedEdges = (
  draft: DraftDocument,
  nodeIds: ReadonlySet<NodeId>
) => [...draft.edges.values()].filter((edge) => (
  (edge.source.kind === 'node' && nodeIds.has(edge.source.nodeId))
  || (edge.target.kind === 'node' && nodeIds.has(edge.target.nodeId))
))

const clonePoint = (
  point: { x: number; y: number } | undefined
) => (
  point
    ? {
        x: point.x,
        y: point.y
      }
    : undefined
)

const cloneSize = (
  size: { width: number; height: number } | undefined
) => (
  size
    ? {
        width: size.width,
        height: size.height
      }
    : undefined
)

const cloneBackground = (
  background: Document['background']
) => (
  background
    ? {
        type: background.type,
        color: background.color
      }
    : undefined
)

const cloneNodeOwner = (
  owner: Node['owner']
) => (
  owner
    ? {
        kind: owner.kind,
        id: owner.id
      }
    : undefined
)

const cloneBranchStyle = (
  style: MindmapRecord['members'][string]['branchStyle'] | undefined
) => (
  style
    ? {
        color: style.color,
        line: style.line,
        width: style.width,
        stroke: style.stroke
      }
    : undefined
)

const cloneCanvasRef = (
  ref: CanvasItemRef | undefined
) => (
  ref
    ? {
        kind: ref.kind,
        id: ref.id
      }
    : undefined
)

const cloneCanvasSlot = (
  slot: {
    prev?: CanvasItemRef
    next?: CanvasItemRef
  } | undefined
) => (
  slot
    ? {
        prev: cloneCanvasRef(slot.prev),
        next: cloneCanvasRef(slot.next)
      }
    : undefined
)

const cloneEdgeAnchor = (
  anchor: EdgeAnchor | undefined
) => (
  anchor
    ? {
        side: anchor.side,
        offset: anchor.offset
      }
    : undefined
)

const cloneEdgeEnd = (
  end: Edge['source']
): Edge['source'] => (
  end.kind === 'node'
    ? {
        kind: 'node',
        nodeId: end.nodeId,
        anchor: cloneEdgeAnchor(end.anchor)
      }
    : {
        kind: 'point',
        point: clonePoint(end.point)!
      }
)

const cloneEdgeRoute = (
  route: Edge['route']
) => (
  route?.kind === 'manual'
    ? {
        kind: 'manual' as const,
        points: route.points.map((point) => clonePoint(point)!)
      }
    : route
      ? {
          kind: 'auto' as const
        }
      : undefined
)

const cloneEdgeStyle = (
  style: Edge['style']
) => (
  style
    ? {
        color: style.color,
        opacity: style.opacity,
        width: style.width,
        dash: style.dash,
        start: style.start,
        end: style.end
      }
    : undefined
)

const cloneEdgeLabelStyle = (
  style: EdgeLabelStyle | undefined
) => (
  style
    ? {
        size: style.size,
        weight: style.weight,
        italic: style.italic,
        color: style.color,
        bg: style.bg
      }
    : undefined
)

const cloneEdgeLabels = (
  labels: Edge['labels']
) => labels?.map((label) => ({
  id: label.id,
  text: label.text,
  t: label.t,
  offset: label.offset,
  style: cloneEdgeLabelStyle(label.style)
}))

const cloneNode = (
  node: Node
): Node => ({
  id: node.id,
  type: node.type,
  position: clonePoint(node.position)!,
  size: cloneSize(node.size),
  rotation: node.rotation,
  layer: node.layer,
  zIndex: node.zIndex,
  groupId: node.groupId,
  owner: cloneNodeOwner(node.owner),
  locked: node.locked,
  data: cloneValue(node.data),
  style: cloneValue(node.style)
})

const cloneEdge = (
  edge: Edge
): Edge => ({
  id: edge.id,
  source: cloneEdgeEnd(edge.source),
  target: cloneEdgeEnd(edge.target),
  type: edge.type,
  locked: edge.locked,
  groupId: edge.groupId,
  route: cloneEdgeRoute(edge.route),
  style: cloneEdgeStyle(edge.style),
  textMode: edge.textMode,
  labels: cloneEdgeLabels(edge.labels),
  data: cloneValue(edge.data)
})

const cloneGroup = (
  group: Group
): Group => ({
  id: group.id,
  locked: group.locked,
  name: group.name
})

const cloneMindmapMember = (
  member: MindmapRecord['members'][NodeId] | undefined
) => (
  member
    ? {
        parentId: member.parentId,
        side: member.side,
        collapsed: member.collapsed,
        branchStyle: cloneBranchStyle(member.branchStyle)!
      }
    : undefined
)

const cloneMindmap = (
  mindmap: MindmapRecord
): MindmapRecord => ({
  id: mindmap.id,
  root: mindmap.root,
  members: Object.fromEntries(
    Object.entries(mindmap.members).map(([nodeId, member]) => [
      nodeId,
      cloneMindmapMember(member)!
    ])
  ),
  children: Object.fromEntries(
    Object.entries(mindmap.children).map(([nodeId, children]) => [
      nodeId,
      [...children]
    ])
  ),
  layout: cloneMindmapLayout(mindmap.layout),
  meta: mindmap.meta
    ? {
        createdAt: mindmap.meta.createdAt,
        updatedAt: mindmap.meta.updatedAt
      }
    : undefined
})

const cloneMindmapLayout = (
  layout: MindmapLayoutSpec
): MindmapLayoutSpec => ({
  side: layout.side,
  mode: layout.mode,
  hGap: layout.hGap,
  vGap: layout.vGap
})

const cloneLayoutPatch = (
  layout: Partial<MindmapLayoutSpec> | undefined
) => (
  layout
    ? {
        ...layout
      }
    : undefined
)

const applyEdgePatch = (
  edge: Edge,
  patch: Partial<Omit<Edge, 'id'>>
): Edge => ({
  ...edge,
  ...(hasOwn(patch, 'source') ? { source: patch.source } : {}),
  ...(hasOwn(patch, 'target') ? { target: patch.target } : {}),
  ...(hasOwn(patch, 'type') ? { type: patch.type } : {}),
  ...(hasOwn(patch, 'locked') ? { locked: patch.locked } : {}),
  ...(hasOwn(patch, 'groupId') ? { groupId: patch.groupId } : {}),
  ...(hasOwn(patch, 'route') ? { route: patch.route } : {}),
  ...(hasOwn(patch, 'style') ? { style: patch.style } : {}),
  ...(hasOwn(patch, 'textMode') ? { textMode: patch.textMode } : {}),
  ...(hasOwn(patch, 'labels') ? { labels: patch.labels } : {}),
  ...(hasOwn(patch, 'data') ? { data: patch.data } : {})
})

const applyGroupPatch = (
  group: Group,
  patch: Partial<Omit<Group, 'id'>>
): Group => ({
  ...group,
  ...(hasOwn(patch, 'locked') ? { locked: patch.locked } : {}),
  ...(hasOwn(patch, 'name') ? { name: patch.name } : {})
})

const applyNodePatch = (
  node: Node,
  patch: NodePatch
): Node => ({
  ...node,
  ...(hasOwn(patch, 'position') ? { position: patch.position } : {}),
  ...(hasOwn(patch, 'size') ? { size: patch.size } : {}),
  ...(hasOwn(patch, 'rotation') ? { rotation: patch.rotation } : {}),
  ...(hasOwn(patch, 'layer') ? { layer: patch.layer } : {}),
  ...(hasOwn(patch, 'zIndex') ? { zIndex: patch.zIndex } : {}),
  ...(hasOwn(patch, 'groupId') ? { groupId: patch.groupId } : {}),
  ...(hasOwn(patch, 'owner') ? { owner: patch.owner } : {}),
  ...(hasOwn(patch, 'locked') ? { locked: patch.locked } : {}),
  ...(hasOwn(patch, 'data') ? { data: patch.data } : {}),
  ...(hasOwn(patch, 'style') ? { style: patch.style } : {})
})

const applyMindmapTopicPatch = (
  node: Node,
  patch: Operation extends infer _T ? Extract<Operation, { type: 'mindmap.topic.patch' }>['patch'] : never
): Node => ({
  ...node,
  ...(hasOwn(patch, 'size') ? { size: patch.size } : {}),
  ...(hasOwn(patch, 'rotation') ? { rotation: patch.rotation } : {}),
  ...(hasOwn(patch, 'locked') ? { locked: patch.locked } : {}),
  ...(hasOwn(patch, 'data') ? { data: patch.data } : {}),
  ...(hasOwn(patch, 'style') ? { style: patch.style } : {})
})

export const reduceOperations = (
  document: Document,
  operations: readonly Operation[],
  _ctx: KernelContext = {}
): KernelReduceResult => {
  const origin = _ctx.origin ?? 'user'
  const violation = validateLockOperations({
    document,
    operations,
    origin
  })
  if (violation) {
    return err(
      'cancelled',
      readLockViolationMessage(violation.reason, violation.operation)
    )
  }

  const draft = createDraftDocument(document)
  const changes = createChangeSet()
  const inverse: Operation[] = []
  const reconcile = createReconcileQueue()
  const queueMindmapLayout = (id: string) => {
    reconcile.enqueue({
      type: 'mindmap.layout',
      id
    })
  }

  for (const operation of operations) {
    switch (operation.type) {
      case 'document.replace': {
        inverse.unshift({
          type: 'document.replace',
          document: materializeDraftDocument(draft)
        })
        return ok({
          doc: operation.document,
          changes: {
            ...createChangeSet(),
            document: true,
            background: true,
            canvasOrder: true
          },
          invalidation: {
            ...createInvalidation(),
            document: true,
            background: true,
            canvasOrder: true
          },
          inverse,
          impact: RESET_READ_IMPACT
        })
      }
      case 'document.background': {
        inverse.unshift({
          type: 'document.background',
          background: cloneBackground(draft.background)
        })
        draft.background = operation.background
        changes.background = true
        changes.document = true
        continue
      }
      case 'canvas.order': {
        inverse.unshift({
          type: 'canvas.order',
          refs: [...readCanvasOrder(draft)]
        })
        writeCanvasOrder(draft, [...operation.refs])
        changes.canvasOrder = true
        continue
      }
      case 'node.create': {
        setNode(draft, operation.node)
        inverse.unshift({
          type: 'node.delete',
          id: operation.node.id
        })
        markChange(changes.nodes, 'add', operation.node.id)
        changes.canvasOrder ||= isTopLevelNode(draft, operation.node)
        continue
      }
      case 'node.restore': {
        draft.nodes.set(operation.node.id, operation.node)
        if (isTopLevelNode(draft, operation.node)) {
          writeCanvasOrder(draft, insertCanvasSlot(readCanvasOrder(draft), {
            kind: 'node',
            id: operation.node.id
          }, operation.slot))
          changes.canvasOrder = true
        }
        inverse.unshift({
          type: 'node.delete',
          id: operation.node.id
        })
        markChange(changes.nodes, 'add', operation.node.id)
        continue
      }
      case 'node.patch': {
        const current = getNode(draft, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        const previous = cloneNode(current)
        draft.nodes.set(operation.id, applyNodePatch(current, operation.patch))
        inverse.unshift({
          type: 'node.patch',
          id: operation.id,
          patch: {
            position: previous.position,
            size: previous.size,
            rotation: previous.rotation,
            layer: previous.layer,
            zIndex: previous.zIndex,
            groupId: previous.groupId,
            owner: previous.owner,
            locked: previous.locked,
            data: previous.data,
            style: previous.style
          }
        })
        markChange(changes.nodes, 'update', operation.id)
        if (current.owner?.kind === 'mindmap') {
          queueMindmapLayout(current.owner.id)
        }
        continue
      }
      case 'node.move': {
        const current = getNode(draft, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        draft.nodes.set(operation.id, {
          ...current,
          position: {
            x: current.position.x + operation.delta.x,
            y: current.position.y + operation.delta.y
          }
        })
        inverse.unshift({
          type: 'node.move',
          id: operation.id,
          delta: {
            x: -operation.delta.x,
            y: -operation.delta.y
          }
        })
        markChange(changes.nodes, 'update', operation.id)
        continue
      }
      case 'node.delete': {
        const current = getNode(draft, operation.id)
        if (!current) {
          continue
        }
        const slot = isTopLevelNode(draft, current)
          ? readCanvasSlot(readCanvasOrder(draft), { kind: 'node', id: current.id })
          : undefined
        inverse.unshift({
          type: 'node.restore',
          node: cloneNode(current),
          slot: cloneCanvasSlot(slot)
        })
        deleteNode(draft, operation.id)
        markChange(changes.nodes, 'delete', operation.id)
        if (slot) {
          changes.canvasOrder = true
        }
        continue
      }
      case 'node.duplicate': {
        const current = getNode(draft, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        return err('invalid', `Reducer cannot duplicate node ${current.id} without planned ids.`)
      }
      case 'edge.create': {
        setEdge(draft, operation.edge)
        inverse.unshift({
          type: 'edge.delete',
          id: operation.edge.id
        })
        markChange(changes.edges, 'add', operation.edge.id)
        changes.canvasOrder = true
        continue
      }
      case 'edge.restore': {
        draft.edges.set(operation.edge.id, operation.edge)
        writeCanvasOrder(draft, insertCanvasSlot(readCanvasOrder(draft), {
          kind: 'edge',
          id: operation.edge.id
        }, operation.slot))
        inverse.unshift({
          type: 'edge.delete',
          id: operation.edge.id
        })
        markChange(changes.edges, 'add', operation.edge.id)
        changes.canvasOrder = true
        continue
      }
      case 'edge.patch': {
        const current = getEdge(draft, operation.id)
        if (!current) {
          return err('invalid', `Edge ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'edge.patch',
          id: operation.id,
          patch: {
            source: cloneEdgeEnd(current.source),
            target: cloneEdgeEnd(current.target),
            type: current.type,
            locked: current.locked,
            groupId: current.groupId,
            route: cloneEdgeRoute(current.route),
            style: cloneEdgeStyle(current.style),
            textMode: current.textMode,
            labels: cloneEdgeLabels(current.labels),
            data: cloneValue(current.data)
          }
        })
        draft.edges.set(operation.id, applyEdgePatch(current, operation.patch))
        markChange(changes.edges, 'update', operation.id)
        continue
      }
      case 'edge.delete': {
        const current = getEdge(draft, operation.id)
        if (!current) continue
        inverse.unshift({
          type: 'edge.restore',
          edge: cloneEdge(current),
          slot: cloneCanvasSlot(readCanvasSlot(readCanvasOrder(draft), {
            kind: 'edge',
            id: current.id
          }))
        })
        deleteEdge(draft, operation.id)
        markChange(changes.edges, 'delete', operation.id)
        changes.canvasOrder = true
        continue
      }
      case 'group.create': {
        draft.groups.set(operation.group.id, operation.group)
        inverse.unshift({
          type: 'group.delete',
          id: operation.group.id
        })
        markChange(changes.groups, 'add', operation.group.id)
        continue
      }
      case 'group.restore': {
        draft.groups.set(operation.group.id, operation.group)
        inverse.unshift({
          type: 'group.delete',
          id: operation.group.id
        })
        markChange(changes.groups, 'add', operation.group.id)
        continue
      }
      case 'group.patch': {
        const current = draft.groups.get(operation.id)
        if (!current) {
          return err('invalid', `Group ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'group.patch',
          id: operation.id,
          patch: {
            locked: current.locked,
            name: current.name
          }
        })
        draft.groups.set(operation.id, applyGroupPatch(current, operation.patch))
        markChange(changes.groups, 'update', operation.id)
        continue
      }
      case 'group.delete': {
        const current = draft.groups.get(operation.id)
        if (!current) continue
        inverse.unshift({
          type: 'group.restore',
          group: cloneGroup(current)
        })
        draft.groups.delete(operation.id)
        markChange(changes.groups, 'delete', operation.id)
        continue
      }
      case 'mindmap.create': {
        draft.mindmaps.set(operation.mindmap.id, operation.mindmap)
        markChange(changes.mindmaps, 'add', operation.mindmap.id)
        inverse.unshift({
          type: 'mindmap.delete',
          id: operation.mindmap.id
        })
        operation.nodes.forEach((node) => {
          setNode(draft, node)
          markChange(changes.nodes, 'add', node.id)
        })
        changes.canvasOrder = true
        queueMindmapLayout(operation.mindmap.id)
        continue
      }
      case 'mindmap.restore': {
        draft.mindmaps.set(operation.snapshot.mindmap.id, operation.snapshot.mindmap)
        operation.snapshot.nodes.forEach((node) => {
          draft.nodes.set(node.id, node)
        })
        const rootId = operation.snapshot.mindmap.root
        writeCanvasOrder(draft, insertCanvasSlot(readCanvasOrder(draft), {
          kind: 'node',
          id: rootId
        }, operation.snapshot.slot))
        inverse.unshift({
          type: 'mindmap.delete',
          id: operation.snapshot.mindmap.id
        })
        markChange(changes.mindmaps, 'add', operation.snapshot.mindmap.id)
        operation.snapshot.nodes.forEach((node) => markChange(changes.nodes, 'add', node.id))
        changes.canvasOrder = true
        queueMindmapLayout(operation.snapshot.mindmap.id)
        continue
      }
      case 'mindmap.delete': {
        const mindmap = getMindmap(draft, operation.id)
        if (!mindmap) continue
        const tree = getMindmapTreeFromDraft(draft, operation.id)
        if (!tree) continue
        const nodeIds = new Set(getSubtreeIds(tree, tree.rootNodeId))
        const nodes = [...nodeIds].map((nodeId) => cloneNode(getNode(draft, nodeId)!)).filter(Boolean)
        const slot = readCanvasSlot(readCanvasOrder(draft), {
          kind: 'node',
          id: mindmap.root
        })
        const connectedEdges = collectConnectedEdges(draft, nodeIds)
        connectedEdges.forEach((edge) => {
          inverse.unshift({
            type: 'edge.restore',
            edge: cloneEdge(edge),
            slot: cloneCanvasSlot(readCanvasSlot(readCanvasOrder(draft), {
              kind: 'edge',
              id: edge.id
            }))
          })
          deleteEdge(draft, edge.id)
          markChange(changes.edges, 'delete', edge.id)
        })
        inverse.unshift({
          type: 'mindmap.restore',
          snapshot: {
            mindmap: cloneMindmap(mindmap),
            nodes,
            slot: cloneCanvasSlot(slot)
          }
        })
        nodeIds.forEach((nodeId) => {
          deleteNode(draft, nodeId)
          markChange(changes.nodes, 'delete', nodeId)
        })
        draft.mindmaps.delete(operation.id)
        markChange(changes.mindmaps, 'delete', operation.id)
        changes.canvasOrder = true
        continue
      }
      case 'mindmap.root.move': {
        const mindmap = getMindmap(draft, operation.id)
        const root = mindmap ? getNode(draft, mindmap.root) : undefined
        if (!mindmap || !root) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'mindmap.root.move',
          id: operation.id,
          position: clonePoint(root.position)!
        })
        draft.nodes.set(root.id, {
          ...root,
          position: clonePoint(operation.position)!
        })
        markChange(changes.nodes, 'update', root.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.layout': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'mindmap.layout',
          id: operation.id,
          patch: cloneLayoutPatch(current.layout)!
        })
        draft.mindmaps.set(operation.id, {
          ...current,
          layout: {
            ...current.layout,
            ...operation.patch
          }
        })
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.insert': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const tree = getMindmapTreeFromDraft(draft, operation.id)
        if (!tree) {
          return err('invalid', `Mindmap ${operation.id} tree missing.`)
        }
        const input = operation.input
        let parentId: NodeId
        let index: number | undefined
        let side: 'left' | 'right' | undefined
        if (input.kind === 'child') {
          parentId = input.parentId
          index = input.options?.index
          side = input.options?.side
        } else if (input.kind === 'sibling') {
          const target = current.members[input.nodeId]
          parentId = target?.parentId ?? current.root
          const siblings = current.children[parentId] ?? []
          const currentIndex = siblings.indexOf(input.nodeId)
          index = currentIndex < 0
            ? undefined
            : input.position === 'before'
              ? currentIndex
              : currentIndex + 1
          side = target?.side
        } else {
          const target = current.members[input.nodeId]
          parentId = target?.parentId ?? current.root
          side = target?.side ?? input.options?.side
          const siblings = current.children[parentId] ?? []
          const currentIndex = siblings.indexOf(input.nodeId)
          const nextId = operation.node.id
          draft.mindmaps.set(operation.id, {
            ...current,
            members: {
              ...current.members,
              [nextId]: {
                parentId,
                side: parentId === current.root ? side : undefined,
                branchStyle: cloneBranchStyle(target?.branchStyle ?? current.members[parentId]?.branchStyle)!
              },
              [input.nodeId]: {
                ...current.members[input.nodeId],
                parentId: nextId,
                side: undefined
              }
            },
            children: {
              ...current.children,
              [parentId]: currentIndex < 0
                ? siblings
                : [...siblings.slice(0, currentIndex), nextId, ...siblings.slice(currentIndex + 1)],
              [nextId]: [input.nodeId]
            }
          })
          draft.nodes.set(nextId, operation.node)
          inverse.unshift({
            type: 'mindmap.topic.delete',
            id: operation.id,
            input: {
              nodeId: nextId
            }
          })
          markChange(changes.nodes, 'add', nextId)
          markChange(changes.mindmaps, 'update', operation.id)
          queueMindmapLayout(operation.id)
          continue
        }
        const siblings = current.children[parentId] ?? []
        const nextMembers = {
          ...current.members,
          [operation.node.id]: {
            parentId,
            side: parentId === current.root ? side ?? 'right' : undefined,
            branchStyle: cloneBranchStyle(current.members[parentId]?.branchStyle ?? current.members[current.root]?.branchStyle)!
          }
        }
        const nextChildren = {
          ...current.children,
          [parentId]: [...siblings],
          [operation.node.id]: []
        }
        if (index === undefined || index < 0 || index > siblings.length) {
          nextChildren[parentId].push(operation.node.id)
        } else {
          nextChildren[parentId].splice(index, 0, operation.node.id)
        }
        draft.mindmaps.set(operation.id, {
          ...current,
          members: nextMembers,
          children: nextChildren
        })
        draft.nodes.set(operation.node.id, operation.node)
        inverse.unshift({
          type: 'mindmap.topic.delete',
          id: operation.id,
          input: {
            nodeId: operation.node.id
          }
        })
        markChange(changes.nodes, 'add', operation.node.id)
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.restore': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const nextMembers = {
          ...current.members,
          ...Object.fromEntries(
            Object.entries(operation.snapshot.members).map(([nodeId, member]) => [
              nodeId,
              {
                parentId: member.parentId,
                side: member.side,
                collapsed: member.collapsed,
                branchStyle: cloneBranchStyle(member.branchStyle)!
              }
            ])
          )
        }
        const nextChildren = { ...current.children }
        Object.entries(operation.snapshot.children).forEach(([nodeId, children]) => {
          nextChildren[nodeId] = [...children]
        })
        const siblings = [...(nextChildren[operation.snapshot.slot.parent] ?? [])]
        if (operation.snapshot.slot.prev) {
          const index = siblings.indexOf(operation.snapshot.slot.prev)
          if (index >= 0) {
            siblings.splice(index + 1, 0, operation.snapshot.root)
          } else {
            siblings.push(operation.snapshot.root)
          }
        } else if (operation.snapshot.slot.next) {
          const index = siblings.indexOf(operation.snapshot.slot.next)
          if (index >= 0) {
            siblings.splice(index, 0, operation.snapshot.root)
          } else {
            siblings.unshift(operation.snapshot.root)
          }
        } else {
          siblings.push(operation.snapshot.root)
        }
        nextChildren[operation.snapshot.slot.parent] = siblings
        draft.mindmaps.set(operation.id, {
          ...current,
          members: nextMembers,
          children: nextChildren
        })
        operation.snapshot.nodes.forEach((node) => {
          draft.nodes.set(node.id, node)
          markChange(changes.nodes, 'add', node.id)
        })
        inverse.unshift({
          type: 'mindmap.topic.delete',
          id: operation.id,
          input: {
            nodeId: operation.snapshot.root
          }
        })
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.move': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const member = current.members[operation.input.nodeId]
        if (!member?.parentId) {
          return err('invalid', `Topic ${operation.input.nodeId} cannot move.`)
        }
        const prevParentId = member.parentId
        const prevSiblings = [...(current.children[prevParentId] ?? [])]
        const prevIndex = prevSiblings.indexOf(operation.input.nodeId)
        const nextParentId = operation.input.parentId
        const nextSiblings = prevParentId === nextParentId
          ? prevSiblings.filter((id) => id !== operation.input.nodeId)
          : [...(current.children[nextParentId] ?? [])]
        if (
          operation.input.index === undefined
          || operation.input.index < 0
          || operation.input.index > nextSiblings.length
        ) {
          nextSiblings.push(operation.input.nodeId)
        } else {
          nextSiblings.splice(operation.input.index, 0, operation.input.nodeId)
        }
        draft.mindmaps.set(operation.id, {
          ...current,
          members: {
            ...current.members,
            [operation.input.nodeId]: {
              ...member,
              parentId: nextParentId,
              side: nextParentId === current.root
                ? (operation.input.side ?? member.side)
                : undefined
            }
          },
          children: {
            ...current.children,
            [prevParentId]: prevSiblings.filter((id) => id !== operation.input.nodeId),
            [nextParentId]: nextSiblings
          }
        })
        inverse.unshift({
          type: 'mindmap.topic.move',
          id: operation.id,
          input: {
            nodeId: operation.input.nodeId,
            parentId: prevParentId,
            index: prevIndex < 0 ? undefined : prevIndex,
            side: member.side
          }
        })
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.delete': {
        const current = getMindmap(draft, operation.id)
        const tree = getMindmapTreeFromDraft(draft, operation.id)
        if (!current || !tree) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const rootId = operation.input.nodeId
        if (rootId === current.root) {
          return err('invalid', 'Root topic cannot use mindmap.topic.delete.')
        }
        const rootMember = current.members[rootId]
        const parentId = rootMember?.parentId
        if (!parentId) {
          return err('invalid', `Topic ${rootId} parent missing.`)
        }
        const siblings = current.children[parentId] ?? []
        const index = siblings.indexOf(rootId)
        const nodeIds = new Set(getSubtreeIds(tree, rootId))
        const nodes = [...nodeIds].map((nodeId) => cloneNode(getNode(draft, nodeId)!)).filter(Boolean)
        const members = Object.fromEntries(
          [...nodeIds].map((nodeId) => [nodeId, cloneMindmapMember(current.members[nodeId])!])
        )
        const children = Object.fromEntries(
          [...nodeIds].map((nodeId) => [nodeId, [...(current.children[nodeId] ?? [])]])
        )
        const connectedEdges = collectConnectedEdges(draft, nodeIds)
        connectedEdges.forEach((edge) => {
          inverse.unshift({
            type: 'edge.restore',
            edge: cloneEdge(edge),
            slot: cloneCanvasSlot(readCanvasSlot(readCanvasOrder(draft), {
              kind: 'edge',
              id: edge.id
            }))
          })
          deleteEdge(draft, edge.id)
          markChange(changes.edges, 'delete', edge.id)
        })
        inverse.unshift({
          type: 'mindmap.topic.restore',
          id: operation.id,
          snapshot: {
            root: rootId,
            slot: {
              parent: parentId,
              prev: index > 0 ? siblings[index - 1] : undefined,
              next: index >= 0 ? siblings[index + 1] : undefined
            },
            nodes,
            members,
            children
          }
        })
        const nextMembers = { ...current.members }
        const nextChildren = { ...current.children }
        nextChildren[parentId] = siblings.filter((nodeId) => nodeId !== rootId)
        nodeIds.forEach((nodeId) => {
          delete nextMembers[nodeId]
          delete nextChildren[nodeId]
          draft.nodes.delete(nodeId)
          markChange(changes.nodes, 'delete', nodeId)
        })
        draft.mindmaps.set(operation.id, {
          ...current,
          members: nextMembers,
          children: nextChildren
        })
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.clone':
        return err('invalid', 'Reducer cannot clone topic subtree without planned ids.')
      case 'mindmap.topic.patch': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const inversePatches: Operation[] = []
        operation.topicIds.forEach((topicId) => {
          const node = getNode(draft, topicId)
          if (!node) return
          inversePatches.unshift({
            type: 'mindmap.topic.patch',
            id: operation.id,
            topicIds: [topicId],
            patch: {
              data: cloneValue(node.data),
              style: cloneValue(node.style),
              size: cloneSize(node.size),
              rotation: node.rotation,
              locked: node.locked
            }
          })
          draft.nodes.set(topicId, applyMindmapTopicPatch(node, operation.patch))
          markChange(changes.nodes, 'update', topicId)
        })
        inverse.unshift(...inversePatches)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.branch.patch': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const nextMembers = { ...current.members }
        const inverseOps: Operation[] = []
        operation.topicIds.forEach((topicId) => {
          const member = current.members[topicId]
          if (!member) return
          inverseOps.unshift({
            type: 'mindmap.branch.patch',
            id: operation.id,
            topicIds: [topicId],
            patch: cloneBranchStyle(member.branchStyle)!
          })
          nextMembers[topicId] = {
            ...member,
            branchStyle: {
              ...member.branchStyle,
              ...operation.patch
            }
          }
        })
        draft.mindmaps.set(operation.id, {
          ...current,
          members: nextMembers
        })
        inverse.unshift(...inverseOps)
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.collapse': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const member = current.members[operation.topicId]
        if (!member) {
          return err('invalid', `Topic ${operation.topicId} not found.`)
        }
        inverse.unshift({
          type: 'mindmap.topic.collapse',
          id: operation.id,
          topicId: operation.topicId,
          collapsed: member.collapsed
        })
        draft.mindmaps.set(operation.id, {
          ...current,
          members: {
            ...current.members,
            [operation.topicId]: {
              ...member,
              collapsed: operation.collapsed ?? !member.collapsed
            }
          }
        })
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
    }
  }

  const drained = reconcile.drain((task) => {
    if (task.type !== 'mindmap.layout') {
      return
    }

    relayoutMindmap(draft, task.id)
    const record = draft.mindmaps.get(task.id)
    if (!record) {
      return
    }

    getSubtreeIds(getMindmapTreeFromDraft(draft, task.id)!, record.root).forEach((nodeId) => {
      markChange(changes.nodes, 'update', nodeId)
    })
  })
  if (!drained.ok) {
    return drained
  }

  const invalidation = createInvalidation()
  invalidation.document = changes.document
  invalidation.background = changes.background
  invalidation.canvasOrder = changes.canvasOrder
  changes.nodes.add.forEach((id) => invalidation.nodes.add(id))
  changes.nodes.update.forEach((id) => invalidation.nodes.add(id))
  changes.nodes.delete.forEach((id) => invalidation.nodes.add(id))
  changes.edges.add.forEach((id) => invalidation.edges.add(id))
  changes.edges.update.forEach((id) => invalidation.edges.add(id))
  changes.edges.delete.forEach((id) => invalidation.edges.add(id))
  changes.groups.add.forEach((id) => invalidation.groups.add(id))
  changes.groups.update.forEach((id) => invalidation.groups.add(id))
  changes.groups.delete.forEach((id) => invalidation.groups.add(id))
  changes.mindmaps.add.forEach((id) => invalidation.mindmaps.add(id))
  changes.mindmaps.update.forEach((id) => invalidation.mindmaps.add(id))
  changes.mindmaps.delete.forEach((id) => invalidation.mindmaps.add(id))
  if (invalidation.nodes.size > 0) {
    invalidation.projections.add('node')
  }
  if (invalidation.edges.size > 0 || invalidation.nodes.size > 0) {
    invalidation.projections.add('edge')
  }
  if (invalidation.mindmaps.size > 0 || invalidation.nodes.size > 0) {
    invalidation.projections.add('mindmap')
  }

  return ok({
    doc: materializeDraftDocument(draft),
    changes,
    invalidation,
    inverse,
    impact: deriveImpact(invalidation)
  })
}
