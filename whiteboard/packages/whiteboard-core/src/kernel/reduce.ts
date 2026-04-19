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
  EdgeLabel,
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
  Operation
} from '@whiteboard/core/types'
import { cloneValue } from '@whiteboard/core/value'
import { applyPathMutation } from '@whiteboard/core/utils/recordMutation'

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
        points: route.points.map((point) => ({
          id: point.id,
          x: point.x,
          y: point.y
        }))
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
  style: cloneEdgeLabelStyle(label.style),
  data: cloneValue(label.data)
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

const applyNodeFieldSet = (
  node: Node,
  operation: Extract<Operation, { type: 'node.field.set' }>
): Node => ({
  ...node,
  [operation.field]: cloneValue(operation.value) as never
})

const applyNodeFieldUnset = (
  node: Node,
  operation: Extract<Operation, { type: 'node.field.unset' }>
): Node => {
  const next = { ...node } as Node & Record<string, unknown>
  delete next[operation.field]
  return next
}

const applyNodeRecordOperation = (
  node: Node,
  operation: Extract<Operation, { type: 'node.record.set' | 'node.record.unset' }>
): { ok: true; node: Node } | { ok: false; message: string } => {
  const current = operation.scope === 'data'
    ? node.data
    : node.style
  const result = applyPathMutation(current, operation.type === 'node.record.set'
    ? {
        op: 'set',
        path: operation.path,
        value: operation.value
      }
    : {
        op: 'unset',
        path: operation.path
      })
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    node: {
      ...node,
      ...(operation.scope === 'data'
        ? { data: result.value as Node['data'] }
        : { style: result.value as Node['style'] })
    }
  }
}

const applyEdgeFieldSet = (
  edge: Edge,
  operation: Extract<Operation, { type: 'edge.field.set' }>
): Edge => ({
  ...edge,
  [operation.field]: cloneValue(operation.value) as never
})

const applyEdgeFieldUnset = (
  edge: Edge,
  operation: Extract<Operation, { type: 'edge.field.unset' }>
): Edge => {
  const next = { ...edge } as Edge & Record<string, unknown>
  delete next[operation.field]
  return next
}

const applyEdgeRecordOperation = (
  edge: Edge,
  operation: Extract<Operation, { type: 'edge.record.set' | 'edge.record.unset' }>
): { ok: true; edge: Edge } | { ok: false; message: string } => {
  const current = operation.scope === 'data'
    ? edge.data
    : edge.style
  const result = applyPathMutation(current, operation.type === 'edge.record.set'
    ? {
        op: 'set',
        path: operation.path,
        value: operation.value
      }
    : {
        op: 'unset',
        path: operation.path
      })
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    edge: {
      ...edge,
      ...(operation.scope === 'data'
        ? { data: result.value as Edge['data'] }
        : { style: result.value as Edge['style'] })
    }
  }
}

const applyGroupFieldSet = (
  group: Group,
  operation: Extract<Operation, { type: 'group.field.set' }>
): Group => ({
  ...group,
  [operation.field]: cloneValue(operation.value) as never
})

const applyGroupFieldUnset = (
  group: Group,
  operation: Extract<Operation, { type: 'group.field.unset' }>
): Group => {
  const next = { ...group } as Group & Record<string, unknown>
  delete next[operation.field]
  return next
}

const applyMindmapTopicFieldSet = (
  node: Node,
  operation: Extract<Operation, { type: 'mindmap.topic.field.set' }>
): Node => ({
  ...node,
  [operation.field]: cloneValue(operation.value) as never
})

const applyMindmapTopicFieldUnset = (
  node: Node,
  operation: Extract<Operation, { type: 'mindmap.topic.field.unset' }>
): Node => {
  const next = { ...node } as Node & Record<string, unknown>
  delete next[operation.field]
  return next
}

const applyMindmapTopicRecordOperation = (
  node: Node,
  operation: Extract<Operation, { type: 'mindmap.topic.record.set' | 'mindmap.topic.record.unset' }>
): { ok: true; node: Node } | { ok: false; message: string } => {
  const current = operation.scope === 'data'
    ? node.data
    : node.style
  const result = applyPathMutation(current, operation.type === 'mindmap.topic.record.set'
    ? {
        op: 'set',
        path: operation.path,
        value: operation.value
      }
    : {
        op: 'unset',
        path: operation.path
      })
  if (!result.ok) {
    return result
  }

  return {
    ok: true,
    node: {
      ...node,
      ...(operation.scope === 'data'
        ? { data: result.value as Node['data'] }
        : { style: result.value as Node['style'] })
    }
  }
}

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
      case 'canvas.order.move': {
        const currentOrder = [...readCanvasOrder(draft)]
        const refs = operation.refs.filter((ref) => (
          currentOrder.some((entry) => sameCanvasRef(entry, ref))
        ))
        if (refs.length === 0) {
          continue
        }

        const previousIndex = currentOrder.findIndex((entry) => sameCanvasRef(entry, refs[0]!))
        const previousTo: Extract<Operation, { type: 'canvas.order.move' }>['to'] = previousIndex <= 0
          ? { kind: 'front' }
          : {
              kind: 'after',
              ref: currentOrder[previousIndex - 1]!
            }

        const filtered = currentOrder.filter((entry) => !refs.some((ref) => sameCanvasRef(ref, entry)))
        const insertAt = operation.to.kind === 'front'
          ? 0
          : operation.to.kind === 'back'
            ? filtered.length
            : (() => {
                const anchorIndex = filtered.findIndex((entry) => (
                  operation.to.kind === 'before' || operation.to.kind === 'after'
                    ? sameCanvasRef(entry, operation.to.ref)
                    : false
                ))
                if (anchorIndex < 0) {
                  return operation.to.kind === 'before'
                    ? 0
                    : filtered.length
                }
                return operation.to.kind === 'before'
                  ? anchorIndex
                  : anchorIndex + 1
              })()

        filtered.splice(insertAt, 0, ...refs)
        inverse.unshift({
          type: 'canvas.order.move',
          refs: [...refs],
          to: previousTo
        })
        writeCanvasOrder(draft, filtered)
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
      case 'node.field.set': {
        const current = getNode(draft, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        inverse.unshift(
          (current as Record<string, unknown>)[operation.field] === undefined && operation.field !== 'position'
            ? {
                type: 'node.field.unset',
                id: operation.id,
                field: operation.field as Extract<Operation, { type: 'node.field.unset' }>['field']
              }
            : {
                type: 'node.field.set',
                id: operation.id,
                field: operation.field,
                value: cloneValue((current as Record<string, unknown>)[operation.field])
              }
        )
        draft.nodes.set(operation.id, applyNodeFieldSet(current, operation))
        markChange(changes.nodes, 'update', operation.id)
        if (current.owner?.kind === 'mindmap') {
          queueMindmapLayout(current.owner.id)
        }
        continue
      }
      case 'node.field.unset': {
        const current = getNode(draft, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'node.field.set',
          id: operation.id,
          field: operation.field,
          value: cloneValue((current as Record<string, unknown>)[operation.field])
        })
        draft.nodes.set(operation.id, applyNodeFieldUnset(current, operation))
        markChange(changes.nodes, 'update', operation.id)
        if (current.owner?.kind === 'mindmap') {
          queueMindmapLayout(current.owner.id)
        }
        continue
      }
      case 'node.record.set':
      case 'node.record.unset': {
        const current = getNode(draft, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        const currentRoot = operation.scope === 'data'
          ? current.data
          : current.style
        if (operation.type === 'node.record.set') {
          const previous = operation.path
            ? currentRoot && typeof currentRoot === 'object'
              ? operation.path.split('.').reduce<unknown>((value, key) => (
                  value && typeof value === 'object'
                    ? (value as Record<string, unknown>)[key]
                    : undefined
                ), currentRoot)
              : undefined
            : currentRoot
          inverse.unshift(previous === undefined
            ? {
                type: 'node.record.unset',
                id: operation.id,
                scope: operation.scope,
                path: operation.path
              }
            : {
                type: 'node.record.set',
                id: operation.id,
                scope: operation.scope,
                path: operation.path,
                value: cloneValue(previous)
              })
        } else {
          const previous = operation.path.split('.').reduce<unknown>((value, key) => (
            value && typeof value === 'object'
              ? (value as Record<string, unknown>)[key]
              : undefined
          ), currentRoot)
          inverse.unshift({
            type: 'node.record.set',
            id: operation.id,
            scope: operation.scope,
            path: operation.path,
            value: cloneValue(previous)
          })
        }
        const next = applyNodeRecordOperation(current, operation)
        if (!next.ok) {
          return err('invalid', next.message)
        }
        draft.nodes.set(operation.id, next.node)
        markChange(changes.nodes, 'update', operation.id)
        if (current.owner?.kind === 'mindmap') {
          queueMindmapLayout(current.owner.id)
        }
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
      case 'edge.field.set': {
        const current = getEdge(draft, operation.id)
        if (!current) {
          return err('invalid', `Edge ${operation.id} not found.`)
        }
        inverse.unshift(
          ((current as unknown as Record<string, unknown>)[operation.field] === undefined) && operation.field !== 'source' && operation.field !== 'target' && operation.field !== 'type'
            ? {
                type: 'edge.field.unset',
                id: operation.id,
                field: operation.field as Extract<Operation, { type: 'edge.field.unset' }>['field']
              }
            : {
                type: 'edge.field.set',
                id: operation.id,
                field: operation.field,
                value: cloneValue((current as unknown as Record<string, unknown>)[operation.field])
              }
        )
        draft.edges.set(operation.id, applyEdgeFieldSet(current, operation))
        markChange(changes.edges, 'update', operation.id)
        continue
      }
      case 'edge.field.unset': {
        const current = getEdge(draft, operation.id)
        if (!current) {
          return err('invalid', `Edge ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'edge.field.set',
          id: operation.id,
          field: operation.field,
          value: cloneValue((current as unknown as Record<string, unknown>)[operation.field])
        })
        draft.edges.set(operation.id, applyEdgeFieldUnset(current, operation))
        markChange(changes.edges, 'update', operation.id)
        continue
      }
      case 'edge.record.set':
      case 'edge.record.unset': {
        const current = getEdge(draft, operation.id)
        if (!current) {
          return err('invalid', `Edge ${operation.id} not found.`)
        }
        const currentRoot = operation.scope === 'data'
          ? current.data
          : current.style
        if (operation.type === 'edge.record.set') {
          const previous = operation.path
            ? currentRoot && typeof currentRoot === 'object'
              ? operation.path.split('.').reduce<unknown>((value, key) => (
                  value && typeof value === 'object'
                    ? (value as Record<string, unknown>)[key]
                    : undefined
                ), currentRoot)
              : undefined
            : currentRoot
          inverse.unshift(previous === undefined
            ? {
                type: 'edge.record.unset',
                id: operation.id,
                scope: operation.scope,
                path: operation.path
              }
            : {
                type: 'edge.record.set',
                id: operation.id,
                scope: operation.scope,
                path: operation.path,
                value: cloneValue(previous)
              })
        } else {
          const previous = operation.path.split('.').reduce<unknown>((value, key) => (
            value && typeof value === 'object'
              ? (value as Record<string, unknown>)[key]
              : undefined
          ), currentRoot)
          inverse.unshift({
            type: 'edge.record.set',
            id: operation.id,
            scope: operation.scope,
            path: operation.path,
            value: cloneValue(previous)
          })
        }
        const next = applyEdgeRecordOperation(current, operation)
        if (!next.ok) {
          return err('invalid', next.message)
        }
        draft.edges.set(operation.id, next.edge)
        markChange(changes.edges, 'update', operation.id)
        continue
      }
      case 'edge.label.insert': {
        const current = getEdge(draft, operation.edgeId)
        if (!current) {
          return err('invalid', `Edge ${operation.edgeId} not found.`)
        }
        const labels = [...(current.labels ?? []).filter((label) => label.id !== operation.label.id)]
        const insertAt = operation.to.kind === 'start'
          ? 0
          : operation.to.kind === 'end'
            ? labels.length
            : (() => {
                const anchorIndex = labels.findIndex((label) => (
                  operation.to.kind === 'before' || operation.to.kind === 'after'
                    ? label.id === operation.to.labelId
                    : false
                ))
                if (anchorIndex < 0) {
                  return operation.to.kind === 'before' ? 0 : labels.length
                }
                return operation.to.kind === 'before' ? anchorIndex : anchorIndex + 1
              })()
        labels.splice(insertAt, 0, operation.label)
        inverse.unshift({
          type: 'edge.label.delete',
          edgeId: operation.edgeId,
          labelId: operation.label.id
        })
        draft.edges.set(operation.edgeId, {
          ...current,
          labels
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.label.delete': {
        const current = getEdge(draft, operation.edgeId)
        const labels = current?.labels ?? []
        const index = labels.findIndex((label) => label.id === operation.labelId)
        if (!current || index < 0) {
          continue
        }
        const label = labels[index]!
        inverse.unshift({
          type: 'edge.label.insert',
          edgeId: operation.edgeId,
          label: cloneValue(label),
          to: index === 0
            ? { kind: 'start' }
            : {
                kind: 'after',
                labelId: labels[index - 1]!.id
              }
        })
        draft.edges.set(operation.edgeId, {
          ...current,
          labels: labels.filter((entry) => entry.id !== operation.labelId)
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.label.move': {
        const current = getEdge(draft, operation.edgeId)
        const labels = [...(current?.labels ?? [])]
        const index = labels.findIndex((label) => label.id === operation.labelId)
        if (!current || index < 0) {
          continue
        }
        const label = labels[index]!
        const inverseTo: Extract<Operation, { type: 'edge.label.move' }>['to'] = index === 0
          ? { kind: 'start' }
          : {
              kind: 'after',
              labelId: labels[index - 1]!.id
            }
        labels.splice(index, 1)
        const insertAt = operation.to.kind === 'start'
          ? 0
          : operation.to.kind === 'end'
            ? labels.length
            : (() => {
                const anchorIndex = labels.findIndex((entry) => (
                  operation.to.kind === 'before' || operation.to.kind === 'after'
                    ? entry.id === operation.to.labelId
                    : false
                ))
                if (anchorIndex < 0) {
                  return operation.to.kind === 'before' ? 0 : labels.length
                }
                return operation.to.kind === 'before' ? anchorIndex : anchorIndex + 1
              })()
        labels.splice(insertAt, 0, label)
        inverse.unshift({
          type: 'edge.label.move',
          edgeId: operation.edgeId,
          labelId: operation.labelId,
          to: inverseTo
        })
        draft.edges.set(operation.edgeId, {
          ...current,
          labels
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.label.field.set': {
        const current = getEdge(draft, operation.edgeId)
        const labels = [...(current?.labels ?? [])]
        const index = labels.findIndex((label) => label.id === operation.labelId)
        if (!current || index < 0) {
          return err('invalid', `Edge label ${operation.labelId} not found.`)
        }
        const label = labels[index]!
        const previous = (label as Record<string, unknown>)[operation.field]
        inverse.unshift(previous === undefined
          ? {
              type: 'edge.label.field.unset',
              edgeId: operation.edgeId,
              labelId: operation.labelId,
              field: operation.field
            }
          : {
              type: 'edge.label.field.set',
              edgeId: operation.edgeId,
              labelId: operation.labelId,
              field: operation.field,
              value: cloneValue(previous)
            })
        labels[index] = {
          ...label,
          [operation.field]: cloneValue(operation.value) as never
        }
        draft.edges.set(operation.edgeId, {
          ...current,
          labels
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.label.field.unset': {
        const current = getEdge(draft, operation.edgeId)
        const labels = [...(current?.labels ?? [])]
        const index = labels.findIndex((label) => label.id === operation.labelId)
        if (!current || index < 0) {
          return err('invalid', `Edge label ${operation.labelId} not found.`)
        }
        const label = labels[index]!
        inverse.unshift({
          type: 'edge.label.field.set',
          edgeId: operation.edgeId,
          labelId: operation.labelId,
          field: operation.field,
          value: cloneValue((label as Record<string, unknown>)[operation.field])
        })
        const nextLabel = { ...label } as EdgeLabel & Record<string, unknown>
        delete nextLabel[operation.field]
        labels[index] = nextLabel
        draft.edges.set(operation.edgeId, {
          ...current,
          labels
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.label.record.set':
      case 'edge.label.record.unset': {
        const current = getEdge(draft, operation.edgeId)
        const labels = [...(current?.labels ?? [])]
        const index = labels.findIndex((label) => label.id === operation.labelId)
        if (!current || index < 0) {
          return err('invalid', `Edge label ${operation.labelId} not found.`)
        }
        const label = labels[index]!
        const currentRoot = operation.scope === 'data'
          ? label.data
          : label.style
        const previous = operation.path.split('.').reduce<unknown>((value, key) => (
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)[key]
            : undefined
        ), currentRoot)
        inverse.unshift(operation.type === 'edge.label.record.set' && previous === undefined
          ? {
              type: 'edge.label.record.unset',
              edgeId: operation.edgeId,
              labelId: operation.labelId,
              scope: operation.scope,
              path: operation.path
            }
          : {
              type: 'edge.label.record.set',
              edgeId: operation.edgeId,
              labelId: operation.labelId,
              scope: operation.scope,
              path: operation.path,
              value: cloneValue(previous)
            })
        const result = applyPathMutation(currentRoot, operation.type === 'edge.label.record.set'
          ? {
              op: 'set',
              path: operation.path,
              value: operation.value
            }
          : {
              op: 'unset',
              path: operation.path
            })
        if (!result.ok) {
          return err('invalid', result.message)
        }
        labels[index] = {
          ...label,
          ...(operation.scope === 'data'
            ? { data: result.value as NonNullable<typeof label.data> }
            : { style: result.value as NonNullable<typeof label.style> })
        }
        draft.edges.set(operation.edgeId, {
          ...current,
          labels
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.route.point.insert': {
        const current = getEdge(draft, operation.edgeId)
        if (!current) {
          return err('invalid', `Edge ${operation.edgeId} not found.`)
        }
        const points = current.route?.kind === 'manual'
          ? [...current.route.points]
          : []
        const insertAt = operation.to.kind === 'start'
          ? 0
          : operation.to.kind === 'end'
            ? points.length
            : (() => {
                const anchorIndex = points.findIndex((point) => (
                  operation.to.kind === 'before' || operation.to.kind === 'after'
                    ? point.id === operation.to.pointId
                    : false
                ))
                if (anchorIndex < 0) {
                  return operation.to.kind === 'before' ? 0 : points.length
                }
                return operation.to.kind === 'before' ? anchorIndex : anchorIndex + 1
              })()
        points.splice(insertAt, 0, operation.point)
        inverse.unshift({
          type: 'edge.route.point.delete',
          edgeId: operation.edgeId,
          pointId: operation.point.id
        })
        draft.edges.set(operation.edgeId, {
          ...current,
          route: points.length > 0
            ? {
                kind: 'manual',
                points
              }
            : {
                kind: 'auto'
              }
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.route.point.delete': {
        const current = getEdge(draft, operation.edgeId)
        const points = current?.route?.kind === 'manual'
          ? [...current.route.points]
          : []
        const index = points.findIndex((point) => point.id === operation.pointId)
        if (!current || index < 0) {
          continue
        }
        const point = points[index]!
        inverse.unshift({
          type: 'edge.route.point.insert',
          edgeId: operation.edgeId,
          point: cloneValue(point),
          to: index === 0
            ? { kind: 'start' }
            : {
                kind: 'after',
                pointId: points[index - 1]!.id
              }
        })
        const nextPoints = points.filter((entry) => entry.id !== operation.pointId)
        draft.edges.set(operation.edgeId, {
          ...current,
          route: nextPoints.length > 0
            ? {
                kind: 'manual',
                points: nextPoints
              }
            : {
                kind: 'auto'
              }
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.route.point.move': {
        const current = getEdge(draft, operation.edgeId)
        const points = current?.route?.kind === 'manual'
          ? [...current.route.points]
          : []
        const index = points.findIndex((point) => point.id === operation.pointId)
        if (!current || index < 0) {
          continue
        }
        const point = points[index]!
        const inverseTo: Extract<Operation, { type: 'edge.route.point.move' }>['to'] = index === 0
          ? { kind: 'start' }
          : {
              kind: 'after',
              pointId: points[index - 1]!.id
            }
        points.splice(index, 1)
        const insertAt = operation.to.kind === 'start'
          ? 0
          : operation.to.kind === 'end'
            ? points.length
            : (() => {
                const anchorIndex = points.findIndex((entry) => (
                  operation.to.kind === 'before' || operation.to.kind === 'after'
                    ? entry.id === operation.to.pointId
                    : false
                ))
                if (anchorIndex < 0) {
                  return operation.to.kind === 'before' ? 0 : points.length
                }
                return operation.to.kind === 'before' ? anchorIndex : anchorIndex + 1
              })()
        points.splice(insertAt, 0, point)
        inverse.unshift({
          type: 'edge.route.point.move',
          edgeId: operation.edgeId,
          pointId: operation.pointId,
          to: inverseTo
        })
        draft.edges.set(operation.edgeId, {
          ...current,
          route: {
            kind: 'manual',
            points
          }
        })
        markChange(changes.edges, 'update', operation.edgeId)
        continue
      }
      case 'edge.route.point.field.set': {
        const current = getEdge(draft, operation.edgeId)
        const points = current?.route?.kind === 'manual'
          ? [...current.route.points]
          : []
        const index = points.findIndex((point) => point.id === operation.pointId)
        if (!current || index < 0) {
          return err('invalid', `Edge route point ${operation.pointId} not found.`)
        }
        const point = points[index]!
        inverse.unshift({
          type: 'edge.route.point.field.set',
          edgeId: operation.edgeId,
          pointId: operation.pointId,
          field: operation.field,
          value: point[operation.field]
        })
        points[index] = {
          ...point,
          [operation.field]: operation.value
        }
        draft.edges.set(operation.edgeId, {
          ...current,
          route: {
            kind: 'manual',
            points
          }
        })
        markChange(changes.edges, 'update', operation.edgeId)
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
      case 'group.field.set': {
        const current = draft.groups.get(operation.id)
        if (!current) {
          return err('invalid', `Group ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'group.field.set',
          id: operation.id,
          field: operation.field,
          value: cloneValue((current as Record<string, unknown>)[operation.field])
        })
        draft.groups.set(operation.id, applyGroupFieldSet(current, operation))
        markChange(changes.groups, 'update', operation.id)
        continue
      }
      case 'group.field.unset': {
        const current = draft.groups.get(operation.id)
        if (!current) {
          return err('invalid', `Group ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'group.field.set',
          id: operation.id,
          field: operation.field,
          value: cloneValue((current as Record<string, unknown>)[operation.field])
        })
        draft.groups.set(operation.id, applyGroupFieldUnset(current, operation))
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
      case 'mindmap.topic.field.set': {
        const current = getNode(draft, operation.topicId)
        if (!current) {
          return err('invalid', `Topic ${operation.topicId} not found.`)
        }
        inverse.unshift(
          (current as Record<string, unknown>)[operation.field] === undefined && operation.field !== 'size'
            ? {
                type: 'mindmap.topic.field.unset',
                id: operation.id,
                topicId: operation.topicId,
                field: operation.field as Extract<Operation, { type: 'mindmap.topic.field.unset' }>['field']
              }
            : {
                type: 'mindmap.topic.field.set',
                id: operation.id,
                topicId: operation.topicId,
                field: operation.field,
                value: cloneValue((current as Record<string, unknown>)[operation.field])
              }
        )
        draft.nodes.set(operation.topicId, applyMindmapTopicFieldSet(current, operation))
        markChange(changes.nodes, 'update', operation.topicId)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.field.unset': {
        const current = getNode(draft, operation.topicId)
        if (!current) {
          return err('invalid', `Topic ${operation.topicId} not found.`)
        }
        inverse.unshift({
          type: 'mindmap.topic.field.set',
          id: operation.id,
          topicId: operation.topicId,
          field: operation.field,
          value: cloneValue((current as Record<string, unknown>)[operation.field])
        })
        draft.nodes.set(operation.topicId, applyMindmapTopicFieldUnset(current, operation))
        markChange(changes.nodes, 'update', operation.topicId)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.record.set':
      case 'mindmap.topic.record.unset': {
        const current = getNode(draft, operation.topicId)
        if (!current) {
          return err('invalid', `Topic ${operation.topicId} not found.`)
        }
        const currentRoot = operation.scope === 'data'
          ? current.data
          : current.style
        const previous = operation.path.split('.').reduce<unknown>((value, key) => (
          value && typeof value === 'object'
            ? (value as Record<string, unknown>)[key]
            : undefined
        ), currentRoot)
        inverse.unshift(operation.type === 'mindmap.topic.record.set' && previous === undefined
          ? {
              type: 'mindmap.topic.record.unset',
              id: operation.id,
              topicId: operation.topicId,
              scope: operation.scope,
              path: operation.path
            }
          : {
              type: 'mindmap.topic.record.set',
              id: operation.id,
              topicId: operation.topicId,
              scope: operation.scope,
              path: operation.path,
              value: cloneValue(previous)
            })
        const next = applyMindmapTopicRecordOperation(current, operation)
        if (!next.ok) {
          return err('invalid', next.message)
        }
        draft.nodes.set(operation.topicId, next.node)
        markChange(changes.nodes, 'update', operation.topicId)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.branch.field.set': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const member = current.members[operation.topicId]
        if (!member) {
          return err('invalid', `Topic ${operation.topicId} not found.`)
        }
        inverse.unshift({
          type: 'mindmap.branch.field.set',
          id: operation.id,
          topicId: operation.topicId,
          field: operation.field,
          value: cloneValue(member.branchStyle[operation.field])
        })
        draft.mindmaps.set(operation.id, {
          ...current,
          members: {
            ...current.members,
            [operation.topicId]: {
              ...member,
              branchStyle: {
                ...member.branchStyle,
                [operation.field]: cloneValue(operation.value) as never
              }
            }
          }
        })
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.branch.field.unset': {
        const current = getMindmap(draft, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const member = current.members[operation.topicId]
        if (!member) {
          return err('invalid', `Topic ${operation.topicId} not found.`)
        }
        inverse.unshift({
          type: 'mindmap.branch.field.set',
          id: operation.id,
          topicId: operation.topicId,
          field: operation.field,
          value: cloneValue(member.branchStyle[operation.field])
        })
        draft.mindmaps.set(operation.id, {
          ...current,
          members: {
            ...current.members,
            [operation.topicId]: {
              ...member,
              branchStyle: {
                ...member.branchStyle,
                [operation.field]: undefined
              }
            }
          }
        })
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
