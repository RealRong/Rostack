import { getEdge, getMindmap, getNode } from '@whiteboard/core/document'
import { validateLockOperations } from '@whiteboard/core/lock'
import {
  anchorMindmapLayout,
  computeMindmapLayout,
  getMindmapTreeFromDocument,
  getSubtreeIds
} from '@whiteboard/core/mindmap'
import { err, ok } from '@whiteboard/core/result'
import type {
  CanvasItemRef,
  ChangeIds,
  ChangeSet,
  Document,
  Edge,
  EdgeId,
  GroupId,
  Invalidation,
  KernelContext,
  KernelReadImpact,
  KernelReduceResult,
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

const isTopLevelNode = (
  doc: Document,
  node: Node | undefined
) => {
  if (!node) return false
  if (!node.owner) return true
  return doc.mindmaps[node.owner.id]?.root === node.id
}

const setNode = (doc: Document, node: Node) => {
  doc.nodes[node.id] = node
  if (isTopLevelNode(doc, node)) {
    doc.canvas.order = appendCanvasRef(doc.canvas.order, {
      kind: 'node',
      id: node.id
    })
  }
}

const deleteNode = (
  doc: Document,
  nodeId: NodeId
) => {
  delete doc.nodes[nodeId]
  doc.canvas.order = removeCanvasRef(doc.canvas.order, {
    kind: 'node',
    id: nodeId
  })
}

const setEdge = (doc: Document, edge: Edge) => {
  doc.edges[edge.id] = edge
  doc.canvas.order = appendCanvasRef(doc.canvas.order, {
    kind: 'edge',
    id: edge.id
  })
}

const deleteEdge = (
  doc: Document,
  edgeId: EdgeId
) => {
  delete doc.edges[edgeId]
  doc.canvas.order = removeCanvasRef(doc.canvas.order, {
    kind: 'edge',
    id: edgeId
  })
}

const relayoutMindmap = (
  doc: Document,
  id: string
) => {
  const record = getMindmap(doc, id)
  const tree = getMindmapTreeFromDocument(doc, id)
  if (!record || !tree) return

  const root = getNode(doc, record.root)
  if (!root) return

  const layout = computeMindmapLayout(
    tree,
    (nodeId) => {
      const node = doc.nodes[nodeId]
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
    const current = doc.nodes[nodeId]
    if (!current) return
    doc.nodes[nodeId] = {
      ...current,
      position: {
        x: rect.x,
        y: rect.y
      },
      size: {
        width: rect.width,
        height: rect.height
      }
    }
  })
}

const collectConnectedEdges = (
  doc: Document,
  nodeIds: ReadonlySet<NodeId>
) => Object.values(doc.edges).filter((edge) => (
  (edge.source.kind === 'node' && nodeIds.has(edge.source.nodeId))
  || (edge.target.kind === 'node' && nodeIds.has(edge.target.nodeId))
))

const cloneDoc = (doc: Document): Document => ({
  ...doc,
  background: cloneValue(doc.background),
  canvas: {
    order: [...doc.canvas.order]
  },
  nodes: Object.fromEntries(
    Object.entries(doc.nodes).map(([id, node]) => [id, cloneValue(node)])
  ),
  edges: Object.fromEntries(
    Object.entries(doc.edges).map(([id, edge]) => [id, cloneValue(edge)])
  ),
  groups: Object.fromEntries(
    Object.entries(doc.groups).map(([id, group]) => [id, cloneValue(group)])
  ),
  mindmaps: Object.fromEntries(
    Object.entries(doc.mindmaps).map(([id, mindmap]) => [id, cloneValue(mindmap)])
  )
})

const applyNodePatch = (
  node: Node,
  patch: NodePatch
): Node => ({
  ...node,
  ...cloneValue(patch),
  data: patch.data === undefined ? node.data : cloneValue(patch.data),
  style: patch.style === undefined ? node.style : cloneValue(patch.style)
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

  const doc = cloneDoc(document)
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
          document: cloneDoc(doc)
        })
        const replaced = cloneDoc(operation.document)
        return ok({
          doc: replaced,
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
          background: cloneValue(doc.background)
        })
        doc.background = cloneValue(operation.background)
        changes.background = true
        changes.document = true
        continue
      }
      case 'canvas.order': {
        inverse.unshift({
          type: 'canvas.order',
          refs: [...doc.canvas.order]
        })
        doc.canvas.order = [...operation.refs]
        changes.canvasOrder = true
        continue
      }
      case 'node.create': {
        setNode(doc, cloneValue(operation.node))
        inverse.unshift({
          type: 'node.delete',
          id: operation.node.id
        })
        markChange(changes.nodes, 'add', operation.node.id)
        changes.canvasOrder ||= isTopLevelNode(doc, operation.node)
        continue
      }
      case 'node.restore': {
        doc.nodes[operation.node.id] = cloneValue(operation.node)
        if (isTopLevelNode(doc, operation.node)) {
          doc.canvas.order = insertCanvasSlot(doc.canvas.order, {
            kind: 'node',
            id: operation.node.id
          }, operation.slot)
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
        const current = getNode(doc, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        const previous = cloneValue(current)
        doc.nodes[operation.id] = applyNodePatch(current, operation.patch)
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
        const current = getNode(doc, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        doc.nodes[operation.id] = {
          ...current,
          position: {
            x: current.position.x + operation.delta.x,
            y: current.position.y + operation.delta.y
          }
        }
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
        const current = getNode(doc, operation.id)
        if (!current) {
          continue
        }
        const slot = isTopLevelNode(doc, current)
          ? readCanvasSlot(doc.canvas.order, { kind: 'node', id: current.id })
          : undefined
        inverse.unshift({
          type: 'node.restore',
          node: cloneValue(current),
          slot
        })
        deleteNode(doc, operation.id)
        markChange(changes.nodes, 'delete', operation.id)
        if (slot) {
          changes.canvasOrder = true
        }
        continue
      }
      case 'node.duplicate': {
        const current = getNode(doc, operation.id)
        if (!current) {
          return err('invalid', `Node ${operation.id} not found.`)
        }
        return err('invalid', `Reducer cannot duplicate node ${current.id} without planned ids.`)
      }
      case 'edge.create': {
        setEdge(doc, cloneValue(operation.edge))
        inverse.unshift({
          type: 'edge.delete',
          id: operation.edge.id
        })
        markChange(changes.edges, 'add', operation.edge.id)
        changes.canvasOrder = true
        continue
      }
      case 'edge.restore': {
        doc.edges[operation.edge.id] = cloneValue(operation.edge)
        doc.canvas.order = insertCanvasSlot(doc.canvas.order, {
          kind: 'edge',
          id: operation.edge.id
        }, operation.slot)
        inverse.unshift({
          type: 'edge.delete',
          id: operation.edge.id
        })
        markChange(changes.edges, 'add', operation.edge.id)
        changes.canvasOrder = true
        continue
      }
      case 'edge.patch': {
        const current = getEdge(doc, operation.id)
        if (!current) {
          return err('invalid', `Edge ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'edge.patch',
          id: operation.id,
          patch: cloneValue(current)
        })
        doc.edges[operation.id] = {
          ...current,
          ...cloneValue(operation.patch)
        }
        markChange(changes.edges, 'update', operation.id)
        continue
      }
      case 'edge.delete': {
        const current = getEdge(doc, operation.id)
        if (!current) continue
        inverse.unshift({
          type: 'edge.restore',
          edge: cloneValue(current),
          slot: readCanvasSlot(doc.canvas.order, {
            kind: 'edge',
            id: current.id
          })
        })
        deleteEdge(doc, operation.id)
        markChange(changes.edges, 'delete', operation.id)
        changes.canvasOrder = true
        continue
      }
      case 'group.create': {
        doc.groups[operation.group.id] = cloneValue(operation.group)
        inverse.unshift({
          type: 'group.delete',
          id: operation.group.id
        })
        markChange(changes.groups, 'add', operation.group.id)
        continue
      }
      case 'group.restore': {
        doc.groups[operation.group.id] = cloneValue(operation.group)
        inverse.unshift({
          type: 'group.delete',
          id: operation.group.id
        })
        markChange(changes.groups, 'add', operation.group.id)
        continue
      }
      case 'group.patch': {
        const current = doc.groups[operation.id]
        if (!current) {
          return err('invalid', `Group ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'group.patch',
          id: operation.id,
          patch: cloneValue(current)
        })
        doc.groups[operation.id] = {
          ...current,
          ...cloneValue(operation.patch)
        }
        markChange(changes.groups, 'update', operation.id)
        continue
      }
      case 'group.delete': {
        const current = doc.groups[operation.id]
        if (!current) continue
        inverse.unshift({
          type: 'group.restore',
          group: cloneValue(current)
        })
        delete doc.groups[operation.id]
        markChange(changes.groups, 'delete', operation.id)
        continue
      }
      case 'mindmap.create': {
        doc.mindmaps[operation.mindmap.id] = cloneValue(operation.mindmap)
        markChange(changes.mindmaps, 'add', operation.mindmap.id)
        inverse.unshift({
          type: 'mindmap.delete',
          id: operation.mindmap.id
        })
        operation.nodes.forEach((node) => {
          setNode(doc, cloneValue(node))
          markChange(changes.nodes, 'add', node.id)
        })
        changes.canvasOrder = true
        queueMindmapLayout(operation.mindmap.id)
        continue
      }
      case 'mindmap.restore': {
        doc.mindmaps[operation.snapshot.mindmap.id] = cloneValue(operation.snapshot.mindmap)
        operation.snapshot.nodes.forEach((node) => {
          doc.nodes[node.id] = cloneValue(node)
        })
        const rootId = operation.snapshot.mindmap.root
        doc.canvas.order = insertCanvasSlot(doc.canvas.order, {
          kind: 'node',
          id: rootId
        }, operation.snapshot.slot)
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
        const mindmap = getMindmap(doc, operation.id)
        if (!mindmap) continue
        const tree = getMindmapTreeFromDocument(doc, operation.id)
        if (!tree) continue
        const nodeIds = new Set(getSubtreeIds(tree, tree.rootNodeId))
        const nodes = [...nodeIds].map((nodeId) => cloneValue(doc.nodes[nodeId]!)).filter(Boolean)
        const slot = readCanvasSlot(doc.canvas.order, {
          kind: 'node',
          id: mindmap.root
        })
        const connectedEdges = collectConnectedEdges(doc, nodeIds)
        connectedEdges.forEach((edge) => {
          inverse.unshift({
            type: 'edge.restore',
            edge: cloneValue(edge),
            slot: readCanvasSlot(doc.canvas.order, {
              kind: 'edge',
              id: edge.id
            })
          })
          deleteEdge(doc, edge.id)
          markChange(changes.edges, 'delete', edge.id)
        })
        inverse.unshift({
          type: 'mindmap.restore',
          snapshot: {
            mindmap: cloneValue(mindmap),
            nodes,
            slot
          }
        })
        nodeIds.forEach((nodeId) => {
          deleteNode(doc, nodeId)
          markChange(changes.nodes, 'delete', nodeId)
        })
        delete doc.mindmaps[operation.id]
        markChange(changes.mindmaps, 'delete', operation.id)
        changes.canvasOrder = true
        continue
      }
      case 'mindmap.root.move': {
        const mindmap = getMindmap(doc, operation.id)
        const root = mindmap ? getNode(doc, mindmap.root) : undefined
        if (!mindmap || !root) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'mindmap.root.move',
          id: operation.id,
          position: cloneValue(root.position)
        })
        doc.nodes[root.id] = {
          ...root,
          position: cloneValue(operation.position)
        }
        markChange(changes.nodes, 'update', root.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.layout': {
        const current = getMindmap(doc, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        inverse.unshift({
          type: 'mindmap.layout',
          id: operation.id,
          patch: cloneValue(current.layout)
        })
        doc.mindmaps[operation.id] = {
          ...current,
          layout: {
            ...current.layout,
            ...cloneValue(operation.patch)
          }
        }
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.insert': {
        const current = getMindmap(doc, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const tree = getMindmapTreeFromDocument(doc, operation.id)
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
          doc.mindmaps[operation.id] = {
            ...current,
            members: {
              ...current.members,
              [nextId]: {
                parentId,
                side: parentId === current.root ? side : undefined,
                branchStyle: cloneValue(target?.branchStyle ?? current.members[parentId]?.branchStyle)
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
          }
          doc.nodes[nextId] = cloneValue(operation.node)
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
            branchStyle: cloneValue(current.members[parentId]?.branchStyle ?? current.members[current.root]?.branchStyle)
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
        doc.mindmaps[operation.id] = {
          ...current,
          members: nextMembers,
          children: nextChildren
        }
        doc.nodes[operation.node.id] = cloneValue(operation.node)
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
        const current = getMindmap(doc, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const nextMembers = { ...current.members, ...cloneValue(operation.snapshot.members) }
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
        doc.mindmaps[operation.id] = {
          ...current,
          members: nextMembers,
          children: nextChildren
        }
        operation.snapshot.nodes.forEach((node) => {
          doc.nodes[node.id] = cloneValue(node)
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
        const current = getMindmap(doc, operation.id)
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
        doc.mindmaps[operation.id] = {
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
        }
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
        const current = getMindmap(doc, operation.id)
        const tree = getMindmapTreeFromDocument(doc, operation.id)
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
        const nodes = [...nodeIds].map((nodeId) => cloneValue(doc.nodes[nodeId]!)).filter(Boolean)
        const members = Object.fromEntries(
          [...nodeIds].map((nodeId) => [nodeId, cloneValue(current.members[nodeId])])
        )
        const children = Object.fromEntries(
          [...nodeIds].map((nodeId) => [nodeId, cloneValue(current.children[nodeId] ?? [])])
        )
        const connectedEdges = collectConnectedEdges(doc, nodeIds)
        connectedEdges.forEach((edge) => {
          inverse.unshift({
            type: 'edge.restore',
            edge: cloneValue(edge),
            slot: readCanvasSlot(doc.canvas.order, {
              kind: 'edge',
              id: edge.id
            })
          })
          deleteEdge(doc, edge.id)
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
          delete doc.nodes[nodeId]
          markChange(changes.nodes, 'delete', nodeId)
        })
        doc.mindmaps[operation.id] = {
          ...current,
          members: nextMembers,
          children: nextChildren
        }
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.clone':
        return err('invalid', 'Reducer cannot clone topic subtree without planned ids.')
      case 'mindmap.topic.patch': {
        const current = getMindmap(doc, operation.id)
        if (!current) {
          return err('invalid', `Mindmap ${operation.id} not found.`)
        }
        const inversePatches: Operation[] = []
        operation.topicIds.forEach((topicId) => {
          const node = doc.nodes[topicId]
          if (!node) return
          inversePatches.unshift({
            type: 'mindmap.topic.patch',
            id: operation.id,
            topicIds: [topicId],
            patch: {
              data: cloneValue(node.data),
              style: cloneValue(node.style),
              size: cloneValue(node.size),
              rotation: node.rotation,
              locked: node.locked
            }
          })
          doc.nodes[topicId] = {
            ...node,
            ...cloneValue(operation.patch),
            data: operation.patch.data === undefined ? node.data : cloneValue(operation.patch.data),
            style: operation.patch.style === undefined ? node.style : cloneValue(operation.patch.style)
          }
          markChange(changes.nodes, 'update', topicId)
        })
        inverse.unshift(...inversePatches)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.branch.patch': {
        const current = getMindmap(doc, operation.id)
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
            patch: cloneValue(member.branchStyle)
          })
          nextMembers[topicId] = {
            ...member,
            branchStyle: {
              ...member.branchStyle,
              ...cloneValue(operation.patch)
            }
          }
        })
        doc.mindmaps[operation.id] = {
          ...current,
          members: nextMembers
        }
        inverse.unshift(...inverseOps)
        markChange(changes.mindmaps, 'update', operation.id)
        queueMindmapLayout(operation.id)
        continue
      }
      case 'mindmap.topic.collapse': {
        const current = getMindmap(doc, operation.id)
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
        doc.mindmaps[operation.id] = {
          ...current,
          members: {
            ...current.members,
            [operation.topicId]: {
              ...member,
              collapsed: operation.collapsed ?? !member.collapsed
            }
          }
        }
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

    relayoutMindmap(doc, task.id)
    const record = doc.mindmaps[task.id]
    if (!record) {
      return
    }

    getSubtreeIds(getMindmapTreeFromDocument(doc, task.id)!, record.root).forEach((nodeId) => {
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
    doc,
    changes,
    invalidation,
    inverse,
    impact: deriveImpact(invalidation)
  })
}
