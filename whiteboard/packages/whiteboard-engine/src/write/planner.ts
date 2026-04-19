import {
  buildInsertSliceOperations,
  exportSliceFromSelection,
  getEdge,
  getMindmap,
  getNode,
  listCanvasItemRefs,
  listGroupCanvasItemRefs
} from '@whiteboard/core/document'
import {
  buildEdgeCreateOperation,
  moveEdge,
  sameEdgeEnd
} from '@whiteboard/core/edge'
import {
  instantiateMindmapTemplate
} from '@whiteboard/core/mindmap'
import { resolveLockDecision } from '@whiteboard/core/lock'
import {
  buildNodeAlignOperations,
  buildNodeCreateOperation,
  buildNodeDistributeOperations,
  createNodeUpdateOperation
} from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  CoreRegistries,
  Document,
  Edge,
  EdgeLabel,
  EdgePatch,
  EdgeId,
  EdgeRoutePoint,
  GroupId,
  MindmapCreateInput,
  MindmapId,
  MindmapTopicField,
  MindmapInsertPayload,
  Node,
  NodeId,
  NodeInput,
  NodeRecordScope,
  Point,
  Operation
} from '@whiteboard/core/types'
import { err, ok } from '@whiteboard/core/result'
import type { Result } from '@whiteboard/core/types/result'
import { isValueEqual } from '@whiteboard/core/value'
import type { EngineCommand } from '@whiteboard/engine/types/command'

type IdAllocator = {
  node: () => NodeId
  edge: () => EdgeId
  edgeRoutePoint: () => string
  group: () => GroupId
  mindmap: () => MindmapId
  mindmapNode: () => NodeId
}

type PlannerContext = {
  doc: Document
  registries: CoreRegistries
  ids: IdAllocator
  nodeSize: { width: number; height: number }
}

type PlanResult<T = unknown> = Result<{
  operations: Operation[]
  output: T
}, 'invalid' | 'cancelled'>

const failLocked = (
  reason: 'locked-node' | 'locked-edge' | 'locked-relation' | undefined,
  action: 'modified' | 'duplicated'
): PlanResult => {
  if (reason === 'locked-node') {
    return err('cancelled', `Locked nodes cannot be ${action}.`)
  }
  if (reason === 'locked-edge') {
    return err('cancelled', `Locked edges cannot be ${action}.`)
  }
  return err('cancelled', `Locked node relations cannot be ${action}.`)
}

const isNodeRef = (
  operation: Operation
): operation is Extract<Operation, { type: 'node.create' }> =>
  operation.type === 'node.create'

const createTopicData = (
  payload?: MindmapInsertPayload | { kind: string; [key: string]: unknown }
) => {
  if (!payload) {
    return {
      text: 'Topic'
    }
  }

  switch (payload.kind) {
    case 'text':
      return {
        text: typeof payload.text === 'string' ? payload.text : 'Topic'
      }
    case 'file':
      return {
        fileId: payload.fileId,
        name: payload.name
      }
    case 'link':
      return {
        url: payload.url,
        title: payload.title
      }
    case 'ref':
      return {
        ref: payload.ref,
        title: payload.title
      }
    default:
      return {
        ...payload
      }
  }
}

const createTopicNode = (
  id: NodeId,
  mindmapId: MindmapId,
  input?: import('@whiteboard/core/types').MindmapInsertInput
): Node => ({
  id,
  type: input?.node?.type ?? 'text',
  owner: {
    kind: 'mindmap',
    id: mindmapId
  },
  position: { x: 0, y: 0 },
  size: input?.node?.size,
  rotation: input?.node?.rotation,
  locked: input?.node?.locked,
  data: {
    ...(input?.node?.data ?? {}),
    ...createTopicData(input?.payload)
  },
  style: input?.node?.style
})

const readNodeMindmapId = (
  node: Pick<Node, 'owner'> | undefined
): MindmapId | undefined => (
  node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
)

const isMindmapRoot = (
  doc: Document,
  node: Node | undefined
) => {
  const mindmapId = readNodeMindmapId(node)
  if (!mindmapId || !node) {
    return false
  }
  return doc.mindmaps[mindmapId]?.root === node.id
}

const reorderRefs = (
  current: readonly { kind: 'node' | 'edge'; id: string }[],
  refs: readonly { kind: 'node' | 'edge'; id: string }[],
  mode: 'set' | 'front' | 'back' | 'forward' | 'backward'
) => {
  const next = [...current]
  const selected = refs.filter((ref) => next.some((entry) => entry.kind === ref.kind && entry.id === ref.id))
  if (!selected.length) {
    return next
  }
  const isSelected = (entry: typeof next[number]) =>
    selected.some((ref) => ref.kind === entry.kind && ref.id === entry.id)

  if (mode === 'set') {
    return [...refs]
  }

  const rest = next.filter((entry) => !isSelected(entry))
  if (mode === 'front') {
    return [...rest, ...selected]
  }
  if (mode === 'back') {
    return [...selected, ...rest]
  }

  if (mode === 'forward') {
    const items = [...next]
    for (let index = items.length - 2; index >= 0; index -= 1) {
      if (isSelected(items[index]) && !isSelected(items[index + 1])) {
        const temp = items[index]
        items[index] = items[index + 1]
        items[index + 1] = temp
      }
    }
    return items
  }

  const items = [...next]
  for (let index = 1; index < items.length; index += 1) {
    if (isSelected(items[index]) && !isSelected(items[index - 1])) {
      const temp = items[index]
      items[index] = items[index - 1]
      items[index - 1] = temp
    }
  }
  return items
}

const hasOwn = <T extends object>(
  target: T,
  key: PropertyKey
) => Object.prototype.hasOwnProperty.call(target, key)

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

const planCanvasOrderOperations = (
  current: readonly CanvasItemRef[],
  target: readonly CanvasItemRef[]
): Operation[] => {
  const working = [...current]
  const operations: Operation[] = []

  for (let index = 0; index < target.length; index += 1) {
    const ref = target[index]!
    if (sameCanvasRef(working[index] ?? { kind: ref.kind, id: '' }, ref)) {
      continue
    }

    const currentIndex = working.findIndex((entry) => sameCanvasRef(entry, ref))
    if (currentIndex < 0) {
      continue
    }

    working.splice(currentIndex, 1)
    working.splice(index, 0, ref)
    operations.push({
      type: 'canvas.order.move',
      refs: [ref],
      to: index === 0
        ? { kind: 'front' }
        : {
            kind: 'after',
            ref: target[index - 1]!
          }
    })
  }

  return operations
}

const isRecordTree = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const appendRecordSetOperations = (
  path: string,
  value: unknown,
  emitSet: (path: string, value: unknown) => void
) => {
  if (isRecordTree(value) && Object.keys(value).length > 0) {
    Object.entries(value).forEach(([key, entry]) => {
      appendRecordSetOperations(
        path ? `${path}.${key}` : key,
        entry,
        emitSet
      )
    })
    return
  }

  if (!path) {
    return
  }

  emitSet(path, value)
}

const appendRecordUnsetOperations = (
  path: string,
  value: unknown,
  emitUnset: (path: string) => void
) => {
  if (isRecordTree(value) && Object.keys(value).length > 0) {
    Object.entries(value).forEach(([key, entry]) => {
      appendRecordUnsetOperations(
        path ? `${path}.${key}` : key,
        entry,
        emitUnset
      )
    })
    return
  }

  if (!path) {
    return
  }

  emitUnset(path)
}

const diffRecordTrees = ({
  current,
  next,
  emitSet,
  emitUnset,
  path = ''
}: {
  current: unknown
  next: unknown
  emitSet: (path: string, value: unknown) => void
  emitUnset: (path: string) => void
  path?: string
}) => {
  if (isValueEqual(current, next)) {
    return
  }

  if (isRecordTree(current) && isRecordTree(next)) {
    const keys = new Set([
      ...Object.keys(current),
      ...Object.keys(next)
    ])

    keys.forEach((key) => {
      const childPath = path ? `${path}.${key}` : key
      if (!hasOwn(next, key)) {
        appendRecordUnsetOperations(childPath, current[key], emitUnset)
        return
      }
      if (!hasOwn(current, key)) {
        appendRecordSetOperations(childPath, next[key], emitSet)
        return
      }
      diffRecordTrees({
        current: current[key],
        next: next[key],
        emitSet,
        emitUnset,
        path: childPath
      })
    })
    return
  }

  if (next === undefined) {
    appendRecordUnsetOperations(path, current, emitUnset)
    return
  }

  if (!path) {
    appendRecordSetOperations(path, next, emitSet)
    return
  }

  emitSet(path, next)
}

const diffNodeRecordOperations = (
  operations: Operation[],
  nodeId: NodeId,
  scope: NodeRecordScope,
  current: unknown,
  next: unknown
) => {
  diffRecordTrees({
    current,
    next,
    emitSet: (path, value) => {
      operations.push({
        type: 'node.record.set',
        id: nodeId,
        scope,
        path,
        value
      })
    },
    emitUnset: (path) => {
      operations.push({
        type: 'node.record.unset',
        id: nodeId,
        scope,
        path
      })
    }
  })
}

const diffEdgeRecordOperations = (
  operations: Operation[],
  edgeId: EdgeId,
  scope: 'data' | 'style',
  current: unknown,
  next: unknown
) => {
  diffRecordTrees({
    current,
    next,
    emitSet: (path, value) => {
      operations.push({
        type: 'edge.record.set',
        id: edgeId,
        scope,
        path,
        value
      })
    },
    emitUnset: (path) => {
      operations.push({
        type: 'edge.record.unset',
        id: edgeId,
        scope,
        path
      })
    }
  })
}

const diffEdgeLabelRecordOperations = (
  operations: Operation[],
  edgeId: EdgeId,
  labelId: string,
  scope: 'data' | 'style',
  current: unknown,
  next: unknown
) => {
  diffRecordTrees({
    current,
    next,
    emitSet: (path, value) => {
      operations.push({
        type: 'edge.label.record.set',
        edgeId,
        labelId,
        scope,
        path,
        value
      })
    },
    emitUnset: (path) => {
      operations.push({
        type: 'edge.label.record.unset',
        edgeId,
        labelId,
        scope,
        path
      })
    }
  })
}

const diffMindmapTopicRecordOperations = (
  operations: Operation[],
  mindmapId: MindmapId,
  topicId: NodeId,
  scope: 'data' | 'style',
  current: unknown,
  next: unknown
) => {
  diffRecordTrees({
    current,
    next,
    emitSet: (path, value) => {
      operations.push({
        type: 'mindmap.topic.record.set',
        id: mindmapId,
        topicId,
        scope,
        path,
        value
      })
    },
    emitUnset: (path) => {
      operations.push({
        type: 'mindmap.topic.record.unset',
        id: mindmapId,
        topicId,
        scope,
        path
      })
    }
  })
}

const planEdgeLabelOperations = (
  edgeId: EdgeId,
  currentLabels: readonly EdgeLabel[],
  nextLabels: readonly EdgeLabel[]
): Operation[] => {
  const operations: Operation[] = []
  const currentMap = new Map(currentLabels.map((label) => [label.id, label] as const))
  const nextMap = new Map(nextLabels.map((label) => [label.id, label] as const))
  const working = currentLabels
    .filter((label) => nextMap.has(label.id))
    .map((label) => label.id)

  currentLabels.forEach((label) => {
    if (!nextMap.has(label.id)) {
      operations.push({
        type: 'edge.label.delete',
        edgeId,
        labelId: label.id
      })
    }
  })

  nextLabels.forEach((label, index) => {
    const to = index === 0
      ? { kind: 'start' as const }
      : {
          kind: 'after' as const,
          labelId: nextLabels[index - 1]!.id
        }

    if (!currentMap.has(label.id)) {
      operations.push({
        type: 'edge.label.insert',
        edgeId,
        label,
        to
      })
      working.splice(index, 0, label.id)
      return
    }

    const currentIndex = working.indexOf(label.id)
    if (currentIndex >= 0 && currentIndex !== index) {
      operations.push({
        type: 'edge.label.move',
        edgeId,
        labelId: label.id,
        to
      })
      working.splice(currentIndex, 1)
      working.splice(index, 0, label.id)
    }
  })

  nextLabels.forEach((label) => {
    const current = currentMap.get(label.id)
    if (!current) {
      return
    }

    ;(['text', 't', 'offset'] as const).forEach((field) => {
      if (current[field] === label[field]) {
        return
      }
      if (label[field] === undefined) {
        operations.push({
          type: 'edge.label.field.unset',
          edgeId,
          labelId: label.id,
          field
        })
        return
      }
      operations.push({
        type: 'edge.label.field.set',
        edgeId,
        labelId: label.id,
        field,
        value: label[field]
      })
    })

    diffEdgeLabelRecordOperations(
      operations,
      edgeId,
      label.id,
      'style',
      current.style,
      label.style
    )
    diffEdgeLabelRecordOperations(
      operations,
      edgeId,
      label.id,
      'data',
      current.data,
      label.data
    )
  })

  return operations
}

const planEdgeRouteOperations = (
  edgeId: EdgeId,
  currentPoints: readonly EdgeRoutePoint[],
  nextPoints: readonly Point[],
  ctx: PlannerContext
): Operation[] => {
  const operations: Operation[] = []
  const samePoint = (left: Point | undefined, right: Point | undefined) => (
    left?.x === right?.x && left?.y === right?.y
  )

  let prefix = 0
  while (
    prefix < currentPoints.length
    && prefix < nextPoints.length
    && samePoint(currentPoints[prefix], nextPoints[prefix])
  ) {
    prefix += 1
  }

  let suffix = 0
  while (
    suffix + prefix < currentPoints.length
    && suffix + prefix < nextPoints.length
    && samePoint(
      currentPoints[currentPoints.length - 1 - suffix],
      nextPoints[nextPoints.length - 1 - suffix]
    )
  ) {
    suffix += 1
  }

  const currentMiddle = currentPoints.slice(prefix, currentPoints.length - suffix)
  const nextMiddle = nextPoints.slice(prefix, nextPoints.length - suffix)

  if (currentMiddle.length === 0 && nextMiddle.length === 0) {
    return operations
  }

  if (currentMiddle.length === 0) {
    let to: Extract<Operation, { type: 'edge.route.point.insert' }>['to'] = prefix === 0
      ? { kind: 'start' }
      : {
          kind: 'after',
          pointId: currentPoints[prefix - 1]!.id
        }

    nextMiddle.forEach((point) => {
      const routePoint: EdgeRoutePoint = {
        id: ctx.ids.edgeRoutePoint(),
        x: point.x,
        y: point.y
      }
      operations.push({
        type: 'edge.route.point.insert',
        edgeId,
        point: routePoint,
        to
      })
      to = {
        kind: 'after',
        pointId: routePoint.id
      }
    })
    return operations
  }

  if (nextMiddle.length === 0) {
    currentMiddle.forEach((point) => {
      operations.push({
        type: 'edge.route.point.delete',
        edgeId,
        pointId: point.id
      })
    })
    return operations
  }

  if (currentMiddle.length === nextMiddle.length) {
    currentMiddle.forEach((point, index) => {
      const nextPoint = nextMiddle[index]!
      if (point.x !== nextPoint.x) {
        operations.push({
          type: 'edge.route.point.field.set',
          edgeId,
          pointId: point.id,
          field: 'x',
          value: nextPoint.x
        })
      }
      if (point.y !== nextPoint.y) {
        operations.push({
          type: 'edge.route.point.field.set',
          edgeId,
          pointId: point.id,
          field: 'y',
          value: nextPoint.y
        })
      }
    })
    return operations
  }

  currentPoints.forEach((point) => {
    operations.push({
      type: 'edge.route.point.delete',
      edgeId,
      pointId: point.id
    })
  })

  let to: Extract<Operation, { type: 'edge.route.point.insert' }>['to'] = { kind: 'start' }
  nextPoints.forEach((point) => {
    const routePoint: EdgeRoutePoint = {
      id: ctx.ids.edgeRoutePoint(),
      x: point.x,
      y: point.y
    }
    operations.push({
      type: 'edge.route.point.insert',
      edgeId,
      point: routePoint,
      to
    })
    to = {
      kind: 'after',
      pointId: routePoint.id
    }
  })

  return operations
}

const compileEdgePatchOperations = (
  edge: Edge,
  patch: EdgePatch,
  ctx: PlannerContext
): Operation[] => {
  const operations: Operation[] = []

  if (hasOwn(patch, 'source') && patch.source && !sameEdgeEnd(edge.source, patch.source)) {
    operations.push({
      type: 'edge.field.set',
      id: edge.id,
      field: 'source',
      value: patch.source
    })
  }

  if (hasOwn(patch, 'target') && patch.target && !sameEdgeEnd(edge.target, patch.target)) {
    operations.push({
      type: 'edge.field.set',
      id: edge.id,
      field: 'target',
      value: patch.target
    })
  }

  if (hasOwn(patch, 'type') && patch.type && edge.type !== patch.type) {
    operations.push({
      type: 'edge.field.set',
      id: edge.id,
      field: 'type',
      value: patch.type
    })
  }

  if (hasOwn(patch, 'locked') && edge.locked !== patch.locked) {
    if (patch.locked === undefined) {
      operations.push({
        type: 'edge.field.unset',
        id: edge.id,
        field: 'locked'
      })
    } else {
      operations.push({
        type: 'edge.field.set',
        id: edge.id,
        field: 'locked',
        value: patch.locked
      })
    }
  }

  if (hasOwn(patch, 'groupId') && edge.groupId !== patch.groupId) {
    if (patch.groupId === undefined) {
      operations.push({
        type: 'edge.field.unset',
        id: edge.id,
        field: 'groupId'
      })
    } else {
      operations.push({
        type: 'edge.field.set',
        id: edge.id,
        field: 'groupId',
        value: patch.groupId
      })
    }
  }

  if (hasOwn(patch, 'textMode') && edge.textMode !== patch.textMode) {
    if (patch.textMode === undefined) {
      operations.push({
        type: 'edge.field.unset',
        id: edge.id,
        field: 'textMode'
      })
    } else {
      operations.push({
        type: 'edge.field.set',
        id: edge.id,
        field: 'textMode',
        value: patch.textMode
      })
    }
  }

  if (hasOwn(patch, 'data')) {
    diffEdgeRecordOperations(operations, edge.id, 'data', edge.data, patch.data)
  }

  if (hasOwn(patch, 'style')) {
    diffEdgeRecordOperations(operations, edge.id, 'style', edge.style, patch.style)
  }

  if (hasOwn(patch, 'labels')) {
    operations.push(
      ...planEdgeLabelOperations(edge.id, edge.labels ?? [], patch.labels ?? [])
    )
  }

  if (hasOwn(patch, 'route')) {
    operations.push(
      ...planEdgeRouteOperations(
        edge.id,
        edge.route?.kind === 'manual' ? edge.route.points : [],
        patch.route?.kind === 'manual' ? patch.route.points : [],
        ctx
      )
    )
  }

  return operations
}

const planNodePatch = (
  doc: Document,
  nodeId: NodeId,
  update: import('@whiteboard/core/types').NodeUpdateInput
): Result<Operation[], 'invalid'> => {
  const node = getNode(doc, nodeId)
  if (!node) {
    return err('invalid', `Node ${nodeId} not found.`)
  }

  const ops: Operation[] = []
  const mindmapId = readNodeMindmapId(node)
  if (!mindmapId) {
    ops.push(...createNodeUpdateOperation(nodeId, update))
    return ok(ops)
  }

  const fields = update.fields
  const isRoot = isMindmapRoot(doc, node)

  if (fields?.position) {
    if (!isRoot) {
      return err('invalid', 'Mindmap member position is reconcile-owned.')
    }
    ops.push({
      type: 'mindmap.root.move',
      id: mindmapId,
      position: fields.position
    })
  }

  if (fields && hasOwn(fields, 'layer')) {
    return err('invalid', 'Mindmap topic layer is not writable.')
  }
  if (fields && hasOwn(fields, 'zIndex')) {
    return err('invalid', 'Mindmap topic zIndex is not writable.')
  }
  if (fields && hasOwn(fields, 'groupId')) {
    return err('invalid', 'Mindmap topic group is not writable.')
  }
  if (fields && hasOwn(fields, 'owner')) {
    return err('invalid', 'Mindmap topic owner is aggregate-owned.')
  }

  const topicFieldMap: Record<'size' | 'rotation' | 'locked', MindmapTopicField> = {
    size: 'size',
    rotation: 'rotation',
    locked: 'locked'
  }

  ;(['size', 'rotation', 'locked'] as const).forEach((key) => {
    if (!fields || !hasOwn(fields, key)) {
      return
    }

    const value = fields[key]
    if (value === undefined && key !== 'size') {
      ops.push({
        type: 'mindmap.topic.field.unset',
        id: mindmapId,
        topicId: nodeId,
        field: topicFieldMap[key] as Extract<Operation, { type: 'mindmap.topic.field.unset' }>['field']
      })
      return
    }

    ops.push({
      type: 'mindmap.topic.field.set',
      id: mindmapId,
      topicId: nodeId,
      field: topicFieldMap[key],
      value
    })
  })

  for (const record of update.records ?? []) {
    if (record.op === 'unset') {
      ops.push({
        type: 'mindmap.topic.record.unset',
        id: mindmapId,
        topicId: nodeId,
        scope: record.scope,
        path: record.path
      })
      continue
    }

    ops.push({
      type: 'mindmap.topic.record.set',
      id: mindmapId,
      topicId: nodeId,
      scope: record.scope,
      path: record.path ?? '',
      value: record.value
    })
  }

  return ok(ops)
}

const planMindmapCreate = (
  input: MindmapCreateInput,
  ctx: PlannerContext
): PlanResult<{ mindmapId: MindmapId; rootId: NodeId }> => {
  const mindmapId = input.id ?? ctx.ids.mindmap()
  const instantiated = instantiateMindmapTemplate({
    template: input.template,
    rootId: mindmapId,
    createNodeId: ctx.ids.mindmapNode
  })

  const nodes = Object.entries(instantiated.nodes).map(([nodeId, templateNode]) => ({
    id: nodeId,
    type: templateNode.type ?? 'text',
    owner: {
      kind: 'mindmap' as const,
      id: mindmapId
    },
    position: nodeId === mindmapId
      ? (input.position ?? { x: 0, y: 0 })
      : { x: 0, y: 0 },
    size: templateNode.size,
    rotation: templateNode.rotation,
    locked: templateNode.locked,
    data: templateNode.data,
    style: templateNode.style
  }))
  const members = Object.fromEntries(
    Object.entries(instantiated.tree.nodes).map(([nodeId, member]) => [
      nodeId,
      {
        parentId: member.parentId,
        side: member.side,
        collapsed: member.collapsed,
        branchStyle: member.branch
      }
    ])
  )

  return ok({
    operations: [{
      type: 'mindmap.create',
      mindmap: {
        id: mindmapId,
        root: instantiated.tree.rootNodeId,
        members,
        children: instantiated.tree.children,
        layout: instantiated.tree.layout,
        meta: instantiated.tree.meta
      },
      nodes
    }],
    output: {
      mindmapId,
      rootId: instantiated.tree.rootNodeId
    }
  })
}

export const planCommand = (
  command: EngineCommand,
  ctx: PlannerContext
): PlanResult => {
  const doc = ctx.doc

  switch (command.type) {
    case 'document.insert': {
      const built = buildInsertSliceOperations({
        doc,
        slice: command.slice,
        nodeSize: ctx.nodeSize,
        registries: ctx.registries,
        createNodeId: ctx.ids.node,
        createEdgeId: ctx.ids.edge,
        origin: command.options?.origin,
        roots: command.options?.roots
      })
      if (!built.ok) {
        return built
      }
      return ok({
        operations: built.data.operations,
        output: {
          nodeIds: built.data.allNodeIds,
          edgeIds: built.data.allEdgeIds,
          roots: built.data.roots
        }
      })
    }
    case 'canvas.delete': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'refs',
          refs: command.refs,
          includeEdgeRelations: true
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'modified')
      }

      const operations: Operation[] = []
      command.refs.forEach((ref) => {
        if (ref.kind === 'edge') {
          operations.push({
            type: 'edge.delete',
            id: ref.id
          })
          return
        }
        const node = doc.nodes[ref.id]
        const mindmapId = readNodeMindmapId(node)
        if (!mindmapId) {
          operations.push({
            type: 'node.delete',
            id: ref.id
          })
          return
        }
        operations.push(
          isMindmapRoot(doc, node)
            ? {
                type: 'mindmap.delete',
                id: mindmapId
              }
            : {
                type: 'mindmap.topic.delete',
                id: mindmapId,
                input: {
                  nodeId: ref.id
                }
              }
        )
      })
      return ok({
        operations,
        output: undefined
      })
    }
    case 'canvas.duplicate': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'refs',
          refs: command.refs,
          includeEdgeRelations: true
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'duplicated')
      }

      const nodeIds = command.refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id)
      if (nodeIds.some((nodeId) => readNodeMindmapId(doc.nodes[nodeId]))) {
        return err('invalid', 'Mindmap duplication must use dedicated mindmap commands.')
      }
      const edgeIds = command.refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
      const exported = exportSliceFromSelection({
        doc,
        nodeIds,
        edgeIds,
        nodeSize: ctx.nodeSize
      })
      if (!exported.ok) {
        return exported
      }
      const built = buildInsertSliceOperations({
        doc,
        slice: exported.data.slice,
        nodeSize: ctx.nodeSize,
        registries: ctx.registries,
        createNodeId: ctx.ids.node,
        createEdgeId: ctx.ids.edge,
        delta: {
          x: 24,
          y: 24
        },
        roots: exported.data.roots
      })
      if (!built.ok) {
        return built
      }
      return ok({
        operations: built.data.operations,
        output: {
          nodeIds: built.data.allNodeIds,
          edgeIds: built.data.allEdgeIds,
          roots: built.data.roots
        }
      })
    }
    case 'document.background':
      return ok({
        operations: [{
          type: 'document.background',
          background: command.background
        }],
        output: undefined
      })
    case 'canvas.order':
      return ok({
        operations: planCanvasOrderOperations(
          listCanvasItemRefs(doc),
          reorderRefs(listCanvasItemRefs(doc), command.refs, command.mode)
        ),
        output: undefined
      })
    case 'node.create': {
      const built = buildNodeCreateOperation({
        payload: command.input as NodeInput,
        doc,
        registries: ctx.registries,
        createNodeId: ctx.ids.node
      })
      if (!built.ok) {
        return built
      }
      return ok({
        operations: [built.data.operation],
        output: {
          nodeId: built.data.nodeId
        }
      })
    }
    case 'node.move': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'nodes',
          nodeIds: command.ids
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'modified')
      }

      const operations: Operation[] = []
      for (const id of command.ids) {
        const node = doc.nodes[id]
        if (!node) {
          return err('invalid', `Node ${id} not found.`)
        }
        const mindmapId = readNodeMindmapId(node)
        if (!mindmapId) {
          operations.push({
            type: 'node.field.set',
            id,
            field: 'position',
            value: {
              x: node.position.x + command.delta.x,
              y: node.position.y + command.delta.y
            }
          })
          continue
        }
        if (!isMindmapRoot(doc, node)) {
          return err('invalid', 'Mindmap member move must use mindmap drag.')
        }
        operations.push({
          type: 'mindmap.root.move',
          id: mindmapId,
          position: {
            x: node.position.x + command.delta.x,
            y: node.position.y + command.delta.y
          }
        })
      }
      return ok({
        operations,
        output: undefined
      })
    }
    case 'node.patch': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'nodes',
          nodeIds: command.updates.map((entry) => entry.id)
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'modified')
      }

      const operations: Operation[] = []
      for (const entry of command.updates) {
        const planned = planNodePatch(doc, entry.id, entry.update)
        if (!planned.ok) {
          return planned
        }
        operations.push(...planned.data)
      }
      return ok({
        operations,
        output: undefined
      })
    }
    case 'node.align': {
      const built = buildNodeAlignOperations({
        ids: command.ids,
        doc,
        nodeSize: ctx.nodeSize,
        mode: command.mode
      })
      return built.ok
        ? ok({ operations: built.data.operations, output: undefined })
        : built
    }
    case 'node.distribute': {
      const built = buildNodeDistributeOperations({
        ids: command.ids,
        doc,
        nodeSize: ctx.nodeSize,
        mode: command.mode
      })
      return built.ok
        ? ok({ operations: built.data.operations, output: undefined })
        : built
    }
    case 'node.delete':
    case 'node.deleteCascade':
      return planCommand({
        type: 'canvas.delete',
        refs: command.ids.map((id) => ({ kind: 'node' as const, id }))
      }, ctx)
    case 'node.duplicate':
      return planCommand({
        type: 'canvas.duplicate',
        refs: command.ids.map((id) => ({ kind: 'node' as const, id }))
      }, ctx)
    case 'group.merge': {
      const groupId = ctx.ids.group()
      const operations: Operation[] = [{
        type: 'group.create',
        group: {
          id: groupId
        }
      }]
      command.target.nodeIds?.forEach((nodeId) => {
        operations.push({
          type: 'node.field.set',
          id: nodeId,
          field: 'groupId',
          value: groupId
        })
      })
      command.target.edgeIds?.forEach((edgeId) => {
        operations.push({
          type: 'edge.field.set',
          id: edgeId,
          field: 'groupId',
          value: groupId
        })
      })
      return ok({
        operations,
        output: {
          groupId
        }
      })
    }
    case 'group.order': {
      const refs = command.ids.flatMap((groupId) => listGroupCanvasItemRefs(doc, groupId))
      return ok({
        operations: planCanvasOrderOperations(
          listCanvasItemRefs(doc),
          reorderRefs(listCanvasItemRefs(doc), refs, command.mode)
        ),
        output: undefined
      })
    }
    case 'group.ungroup': {
      const refs = listGroupCanvasItemRefs(doc, command.id)
      const operations: Operation[] = [{
        type: 'group.delete',
        id: command.id
      }]
      refs.forEach((ref) => {
        if (ref.kind === 'node') {
          operations.push({
            type: 'node.field.unset',
            id: ref.id,
            field: 'groupId'
          })
        } else {
          operations.push({
            type: 'edge.field.unset',
            id: ref.id,
            field: 'groupId'
          })
        }
      })
      return ok({
        operations,
        output: {
          nodeIds: refs.filter((ref) => ref.kind === 'node').map((ref) => ref.id),
          edgeIds: refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)
        }
      })
    }
    case 'group.ungroupMany': {
      const nodeIds: NodeId[] = []
      const edgeIds: EdgeId[] = []
      const operations: Operation[] = []
      for (const groupId of command.ids) {
        const refs = listGroupCanvasItemRefs(doc, groupId)
        operations.push({
          type: 'group.delete',
          id: groupId
        })
        refs.forEach((ref) => {
          if (ref.kind === 'node') {
            nodeIds.push(ref.id)
            operations.push({
              type: 'node.field.unset',
              id: ref.id,
              field: 'groupId'
            })
          } else {
            edgeIds.push(ref.id)
            operations.push({
              type: 'edge.field.unset',
              id: ref.id,
              field: 'groupId'
            })
          }
        })
      }
      return ok({
        operations,
        output: {
          nodeIds,
          edgeIds
        }
      })
    }
    case 'edge.create': {
      const built = buildEdgeCreateOperation({
        payload: command.input,
        doc,
        registries: ctx.registries,
        createEdgeId: ctx.ids.edge,
        createEdgeRoutePointId: ctx.ids.edgeRoutePoint
      })
      if (!built.ok) {
        return built
      }
      return ok({
        operations: [built.data.operation],
        output: {
          edgeId: built.data.edgeId
        }
      })
    }
    case 'edge.move': {
      const decision = resolveLockDecision({
        document: doc,
        target: {
          kind: 'edge-ids',
          edgeIds: command.ids
        }
      })
      if (!decision.allowed) {
        return failLocked(decision.reason, 'modified')
      }

      const operations = command.ids.flatMap((edgeId) => {
        const edge = getEdge(doc, edgeId)
        const patch = edge ? moveEdge(edge, command.delta) : undefined
        return edge && patch
          ? compileEdgePatchOperations(edge, patch, ctx)
          : []
      })
      return ok({ operations, output: undefined })
    }
    case 'edge.reconnect':
      {
        const decision = resolveLockDecision({
          document: doc,
          target: {
            kind: 'edge-ids',
            edgeIds: [command.edgeId]
          }
        })
        if (!decision.allowed) {
          return failLocked(decision.reason, 'modified')
        }
      }
      return ok({
        operations: (() => {
          const edge = getEdge(doc, command.edgeId)
          if (!edge) {
            return []
          }
          return compileEdgePatchOperations(edge, command.end === 'source'
            ? { source: command.target }
            : { target: command.target }, ctx)
        })(),
        output: undefined
      })
    case 'edge.patch':
      {
        const decision = resolveLockDecision({
          document: doc,
          target: {
            kind: 'edge-ids',
            edgeIds: command.updates.map((entry) => entry.id)
          }
        })
        if (!decision.allowed) {
          return failLocked(decision.reason, 'modified')
        }
      }
      return ok({
        operations: command.updates.flatMap((entry) => {
          const edge = getEdge(doc, entry.id)
          return edge
            ? compileEdgePatchOperations(edge, entry.patch, ctx)
            : []
        }),
        output: undefined
      })
    case 'edge.delete':
      {
        const decision = resolveLockDecision({
          document: doc,
          target: {
            kind: 'edge-ids',
            edgeIds: command.ids
          }
        })
        if (!decision.allowed) {
          return failLocked(decision.reason, 'modified')
        }
      }
      return ok({
        operations: command.ids.map((id) => ({
          type: 'edge.delete' as const,
          id
        })),
        output: undefined
      })
    case 'edge.route.insert': {
      const edge = getEdge(doc, command.edgeId)
      if (!edge) {
        return err('invalid', `Edge ${command.edgeId} not found.`)
      }
      const currentPoints = edge.route?.kind === 'manual'
        ? edge.route.points
        : []
      const previous = currentPoints[currentPoints.length - 1]
      const pointId = ctx.ids.edgeRoutePoint()
      return ok({
        operations: [{
          type: 'edge.route.point.insert',
          edgeId: command.edgeId,
          point: {
            id: pointId,
            x: command.point.x,
            y: command.point.y
          },
          to: previous
            ? {
                kind: 'after',
                pointId: previous.id
              }
            : {
                kind: 'start'
              }
        }],
        output: {
          index: currentPoints.length
        }
      })
    }
    case 'edge.route.move': {
      const edge = getEdge(doc, command.edgeId)
      const point = edge?.route?.kind === 'manual'
        ? edge.route.points[command.index]
        : undefined
      if (!point) {
        return err('invalid', `Edge ${command.edgeId} route point not found.`)
      }
      return ok({
        operations: [
          ...(point.x === command.point.x ? [] : [{
            type: 'edge.route.point.field.set' as const,
            edgeId: command.edgeId,
            pointId: point.id,
            field: 'x' as const,
            value: command.point.x
          }]),
          ...(point.y === command.point.y ? [] : [{
            type: 'edge.route.point.field.set' as const,
            edgeId: command.edgeId,
            pointId: point.id,
            field: 'y' as const,
            value: command.point.y
          }])
        ],
        output: undefined
      })
    }
    case 'edge.route.remove': {
      const edge = getEdge(doc, command.edgeId)
      const point = edge?.route?.kind === 'manual'
        ? edge.route.points[command.index]
        : undefined
      if (!point) {
        return err('invalid', `Edge ${command.edgeId} route point not found.`)
      }
      return ok({
        operations: [{
          type: 'edge.route.point.delete',
          edgeId: command.edgeId,
          pointId: point.id
        }],
        output: undefined
      })
    }
    case 'edge.route.clear': {
      const edge = getEdge(doc, command.edgeId)
      if (!edge) {
        return err('invalid', `Edge ${command.edgeId} not found.`)
      }
      return ok({
        operations: edge.route?.kind === 'manual'
          ? edge.route.points.map((point) => ({
              type: 'edge.route.point.delete' as const,
              edgeId: command.edgeId,
              pointId: point.id
            }))
          : [],
        output: undefined
      })
    }
    case 'mindmap.create':
      return planMindmapCreate(command.input, ctx)
    case 'mindmap.delete':
      return ok({
        operations: command.ids.map((id) => ({
          type: 'mindmap.delete' as const,
          id
        })),
        output: undefined
      })
    case 'mindmap.topic.insert': {
      const mindmapId = command.id
      const nodeId = ctx.ids.mindmapNode()
      return ok({
        operations: [{
          type: 'mindmap.topic.insert',
          id: mindmapId,
          input: command.input,
          node: createTopicNode(nodeId, mindmapId, command.input)
        }],
        output: {
          nodeId
        }
      })
    }
    case 'mindmap.topic.move':
      return ok({
        operations: [{
          type: 'mindmap.topic.move',
          id: command.id,
          input: command.input
        }],
        output: undefined
      })
    case 'mindmap.topic.delete':
      return ok({
        operations: [{
          type: 'mindmap.topic.delete',
          id: command.id,
          input: command.input
        }],
        output: undefined
      })
    case 'mindmap.topic.clone': {
      const mindmap = getMindmap(doc, command.id)
      if (!mindmap) {
        return err('invalid', `Mindmap ${command.id} not found.`)
      }
      if (command.input.nodeId === mindmap.root) {
        return err('invalid', 'Root topic clone is not supported by subtree clone.')
      }
      const sourceMember = mindmap.members[command.input.nodeId]
      const targetParentId = command.input.parentId ?? sourceMember?.parentId
      if (!sourceMember || !targetParentId) {
        return err('invalid', `Topic ${command.input.nodeId} cannot be cloned.`)
      }

      const map: Record<NodeId, NodeId> = {}
      const operations: Operation[] = []
      const walk = (sourceId: NodeId) => {
        const nextId = ctx.ids.mindmapNode()
        map[sourceId] = nextId
        const sourceNode = doc.nodes[sourceId]
        const parentId = sourceId === command.input.nodeId
          ? targetParentId
          : map[mindmap.members[sourceId]?.parentId ?? '']
        if (!sourceNode || !parentId) {
          return
        }

        const source = mindmap.members[sourceId]
        operations.push({
          type: 'mindmap.topic.insert',
          id: command.id,
          input: {
            kind: 'child',
            parentId,
            options: sourceId === command.input.nodeId
              ? {
                  index: command.input.index,
                  side: command.input.side ?? source.side
                }
              : {
                  side: source.side
                }
          },
          node: {
            ...sourceNode,
            id: nextId,
            owner: {
              kind: 'mindmap',
              id: command.id
            },
            position: { x: 0, y: 0 }
          }
        })
        operations.push({
          type: 'mindmap.branch.field.set',
          id: command.id,
          topicId: nextId,
          field: 'color',
          value: source.branchStyle.color
        }, {
          type: 'mindmap.branch.field.set',
          id: command.id,
          topicId: nextId,
          field: 'line',
          value: source.branchStyle.line
        }, {
          type: 'mindmap.branch.field.set',
          id: command.id,
          topicId: nextId,
          field: 'width',
          value: source.branchStyle.width
        }, {
          type: 'mindmap.branch.field.set',
          id: command.id,
          topicId: nextId,
          field: 'stroke',
          value: source.branchStyle.stroke
        })
        if (source.collapsed !== undefined) {
          operations.push({
            type: 'mindmap.topic.collapse',
            id: command.id,
            topicId: nextId,
            collapsed: source.collapsed
          })
        }

        ;(mindmap.children[sourceId] ?? []).forEach(walk)
      }

      walk(command.input.nodeId)
      return ok({
        operations,
        output: {
          nodeId: map[command.input.nodeId]!,
          map
        }
      })
    }
    case 'mindmap.layout':
      return ok({
        operations: [{
          type: 'mindmap.layout',
          id: command.id,
          patch: command.patch
        }],
        output: undefined
      })
    case 'mindmap.topic.patch':
      {
        const operations: Operation[] = []
        for (const topicId of command.topicIds) {
          const node = getNode(doc, topicId)
          if (!node) {
            continue
          }

          if (hasOwn(command.patch, 'size')) {
            if (command.patch.size !== undefined) {
              operations.push({
                type: 'mindmap.topic.field.set',
                id: command.id,
                topicId,
                field: 'size',
                value: command.patch.size
              })
            }
          }
          if (hasOwn(command.patch, 'rotation')) {
            if (command.patch.rotation === undefined) {
              operations.push({
                type: 'mindmap.topic.field.unset',
                id: command.id,
                topicId,
                field: 'rotation'
              })
            } else {
              operations.push({
                type: 'mindmap.topic.field.set',
                id: command.id,
                topicId,
                field: 'rotation',
                value: command.patch.rotation
              })
            }
          }
          if (hasOwn(command.patch, 'locked')) {
            if (command.patch.locked === undefined) {
              operations.push({
                type: 'mindmap.topic.field.unset',
                id: command.id,
                topicId,
                field: 'locked'
              })
            } else {
              operations.push({
                type: 'mindmap.topic.field.set',
                id: command.id,
                topicId,
                field: 'locked',
                value: command.patch.locked
              })
            }
          }
          if (hasOwn(command.patch, 'data')) {
            diffMindmapTopicRecordOperations(
              operations,
              command.id,
              topicId,
              'data',
              node.data,
              command.patch.data
            )
          }
          if (hasOwn(command.patch, 'style')) {
            diffMindmapTopicRecordOperations(
              operations,
              command.id,
              topicId,
              'style',
              node.style,
              command.patch.style
            )
          }
        }
        return ok({
          operations,
          output: undefined
        })
      }
    case 'mindmap.branch.patch':
      {
        const mindmap = getMindmap(doc, command.id)
        if (!mindmap) {
          return err('invalid', `Mindmap ${command.id} not found.`)
        }

        const operations: Operation[] = []
        command.topicIds.forEach((topicId) => {
          const member = mindmap.members[topicId]
          if (!member) {
            return
          }

          ;(['color', 'line', 'width', 'stroke'] as const).forEach((field) => {
            if (!hasOwn(command.patch, field)) {
              return
            }
            const value = command.patch[field]
            if (value === undefined) {
              operations.push({
                type: 'mindmap.branch.field.unset',
                id: command.id,
                topicId,
                field
              })
              return
            }
            if (member.branchStyle[field] === value) {
              return
            }
            operations.push({
              type: 'mindmap.branch.field.set',
              id: command.id,
              topicId,
              field,
              value
            })
          })
        })

        return ok({
          operations,
          output: undefined
        })
      }
    case 'mindmap.topic.collapse':
      return ok({
        operations: [{
          type: 'mindmap.topic.collapse',
          id: command.id,
          topicId: command.topicId,
          collapsed: command.collapsed
        }],
        output: undefined
      })
    default:
      return err('invalid', `Unsupported command ${(command as { type: string }).type}.`)
  }
}
