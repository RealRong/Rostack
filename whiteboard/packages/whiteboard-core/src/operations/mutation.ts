import {
  equal,
  json
} from '@shared/core'
import type {
  IdDelta
} from '@shared/delta'
import type {
  MutationCustomTable,
  MutationCustomReduceInput,
  MutationDeltaInput,
  MutationOrigin
} from '@shared/mutation'
import {
  Reducer
} from '@shared/reducer'
import type {
  HistoryFootprint
} from '@whiteboard/core/operations/history'
import {
  definitions
} from '@whiteboard/core/operations/definitions'
import {
  validateLockOperations
} from '@whiteboard/core/operations/lock'
import {
  createWhiteboardReduceContext
} from '@whiteboard/core/reducer/context'
import {
  finishWhiteboardReduce,
  readLockViolationMessage
} from '@whiteboard/core/reducer/extra'
import type {
  WhiteboardReduceCtx,
  WhiteboardReduceExtra,
  WhiteboardReduceIssueCode
} from '@whiteboard/core/reducer/types'
import type {
  ChangeSet,
  Document,
  Edge,
  Group,
  MindmapId,
  MindmapRecord,
  Node,
  Operation
} from '@whiteboard/core/types'

const INVALID_DOCUMENT_REPLACE_BATCH =
  'document.replace must be the only operation in its batch.'

const toKernelOrigin = (
  origin: MutationOrigin
): import('@whiteboard/core/types').Origin => (
  origin === 'remote' || origin === 'system'
    ? origin
    : 'user'
)

const appendIdsChange = (
  delta: MutationDeltaInput,
  key: string,
  ids: readonly string[]
): void => {
  if (ids.length === 0) {
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

const hasChanges = (
  changes: ChangeSet
): boolean => (
  changes.document
  || changes.background
  || changes.canvasOrder
  || changes.nodes.added.size > 0
  || changes.nodes.updated.size > 0
  || changes.nodes.removed.size > 0
  || changes.edges.added.size > 0
  || changes.edges.updated.size > 0
  || changes.edges.removed.size > 0
  || changes.groups.added.size > 0
  || changes.groups.updated.size > 0
  || changes.groups.removed.size > 0
  || changes.mindmaps.added.size > 0
  || changes.mindmaps.updated.size > 0
  || changes.mindmaps.removed.size > 0
)

const toSortedIds = <TId extends string>(
  delta: IdDelta<TId>,
  kind: 'added' | 'updated' | 'removed'
): readonly TId[] => [...delta[kind]].sort()

const same = (
  left: unknown,
  right: unknown
): boolean => equal.sameJsonValue(left, right)

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

const groupValueChanged = (
  before: Group,
  after: Group
): boolean => (
  !same(before.locked, after.locked)
  || !same(before.name, after.name)
)

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

const mindmapMetaChanged = (
  before: MindmapRecord,
  after: MindmapRecord
): boolean => !same(before.meta, after.meta)

const validateWhiteboardOperations = (input: {
  document: Document
  operations: readonly Operation[]
  origin: MutationOrigin
}): {
  code: WhiteboardReduceIssueCode
  message: string
  details?: unknown
} | undefined => {
  const hasDocumentReplace = input.operations.some((op) => op.type === 'document.replace')
  if (hasDocumentReplace && input.operations.length !== 1) {
    return {
      code: 'invalid',
      message: INVALID_DOCUMENT_REPLACE_BATCH,
      details: {
        opCount: input.operations.length
      }
    }
  }

  const violation = validateLockOperations({
    document: input.document,
    operations: input.operations,
    origin: toKernelOrigin(input.origin)
  })

  return violation
    ? {
        code: 'cancelled',
        message: readLockViolationMessage(violation.reason, violation.operation),
        details: violation
      }
    : undefined
}

const runWhiteboardDefinition = (
  ctx: WhiteboardReduceCtx,
  op: Operation
): void => {
  switch (op.type) {
    case 'document.replace':
      definitions['document.replace'].footprint?.(ctx, op)
      definitions['document.replace'].apply(ctx, op)
      return
    case 'document.background':
      definitions['document.background'].footprint?.(ctx, op)
      definitions['document.background'].apply(ctx, op)
      return
    case 'canvas.order.move':
      definitions['canvas.order.move'].footprint?.(ctx, op)
      definitions['canvas.order.move'].apply(ctx, op)
      return
    case 'node.create':
      definitions['node.create'].footprint?.(ctx, op)
      definitions['node.create'].apply(ctx, op)
      return
    case 'node.restore':
      definitions['node.restore'].footprint?.(ctx, op)
      definitions['node.restore'].apply(ctx, op)
      return
    case 'node.patch':
      definitions['node.patch'].footprint?.(ctx, op)
      definitions['node.patch'].apply(ctx, op)
      return
    case 'node.delete':
      definitions['node.delete'].footprint?.(ctx, op)
      definitions['node.delete'].apply(ctx, op)
      return
    case 'edge.create':
      definitions['edge.create'].footprint?.(ctx, op)
      definitions['edge.create'].apply(ctx, op)
      return
    case 'edge.restore':
      definitions['edge.restore'].footprint?.(ctx, op)
      definitions['edge.restore'].apply(ctx, op)
      return
    case 'edge.patch':
      definitions['edge.patch'].footprint?.(ctx, op)
      definitions['edge.patch'].apply(ctx, op)
      return
    case 'edge.label.insert':
      definitions['edge.label.insert'].footprint?.(ctx, op)
      definitions['edge.label.insert'].apply(ctx, op)
      return
    case 'edge.label.delete':
      definitions['edge.label.delete'].footprint?.(ctx, op)
      definitions['edge.label.delete'].apply(ctx, op)
      return
    case 'edge.label.move':
      definitions['edge.label.move'].footprint?.(ctx, op)
      definitions['edge.label.move'].apply(ctx, op)
      return
    case 'edge.label.patch':
      definitions['edge.label.patch'].footprint?.(ctx, op)
      definitions['edge.label.patch'].apply(ctx, op)
      return
    case 'edge.route.point.insert':
      definitions['edge.route.point.insert'].footprint?.(ctx, op)
      definitions['edge.route.point.insert'].apply(ctx, op)
      return
    case 'edge.route.point.delete':
      definitions['edge.route.point.delete'].footprint?.(ctx, op)
      definitions['edge.route.point.delete'].apply(ctx, op)
      return
    case 'edge.route.point.move':
      definitions['edge.route.point.move'].footprint?.(ctx, op)
      definitions['edge.route.point.move'].apply(ctx, op)
      return
    case 'edge.route.point.patch':
      definitions['edge.route.point.patch'].footprint?.(ctx, op)
      definitions['edge.route.point.patch'].apply(ctx, op)
      return
    case 'edge.delete':
      definitions['edge.delete'].footprint?.(ctx, op)
      definitions['edge.delete'].apply(ctx, op)
      return
    case 'group.create':
      definitions['group.create'].footprint?.(ctx, op)
      definitions['group.create'].apply(ctx, op)
      return
    case 'group.restore':
      definitions['group.restore'].footprint?.(ctx, op)
      definitions['group.restore'].apply(ctx, op)
      return
    case 'group.patch':
      definitions['group.patch'].footprint?.(ctx, op)
      definitions['group.patch'].apply(ctx, op)
      return
    case 'group.delete':
      definitions['group.delete'].footprint?.(ctx, op)
      definitions['group.delete'].apply(ctx, op)
      return
    case 'mindmap.create':
      definitions['mindmap.create'].footprint?.(ctx, op)
      definitions['mindmap.create'].apply(ctx, op)
      return
    case 'mindmap.restore':
      definitions['mindmap.restore'].footprint?.(ctx, op)
      definitions['mindmap.restore'].apply(ctx, op)
      return
    case 'mindmap.delete':
      definitions['mindmap.delete'].footprint?.(ctx, op)
      definitions['mindmap.delete'].apply(ctx, op)
      return
    case 'mindmap.move':
      definitions['mindmap.move'].footprint?.(ctx, op)
      definitions['mindmap.move'].apply(ctx, op)
      return
    case 'mindmap.layout':
      definitions['mindmap.layout'].footprint?.(ctx, op)
      definitions['mindmap.layout'].apply(ctx, op)
      return
    case 'mindmap.topic.insert':
      definitions['mindmap.topic.insert'].footprint?.(ctx, op)
      definitions['mindmap.topic.insert'].apply(ctx, op)
      return
    case 'mindmap.topic.restore':
      definitions['mindmap.topic.restore'].footprint?.(ctx, op)
      definitions['mindmap.topic.restore'].apply(ctx, op)
      return
    case 'mindmap.topic.move':
      definitions['mindmap.topic.move'].footprint?.(ctx, op)
      definitions['mindmap.topic.move'].apply(ctx, op)
      return
    case 'mindmap.topic.delete':
      definitions['mindmap.topic.delete'].footprint?.(ctx, op)
      definitions['mindmap.topic.delete'].apply(ctx, op)
      return
    case 'mindmap.topic.patch':
      definitions['mindmap.topic.patch'].footprint?.(ctx, op)
      definitions['mindmap.topic.patch'].apply(ctx, op)
      return
    case 'mindmap.branch.patch':
      definitions['mindmap.branch.patch'].footprint?.(ctx, op)
      definitions['mindmap.branch.patch'].apply(ctx, op)
      return
    case 'mindmap.topic.collapse':
      definitions['mindmap.topic.collapse'].footprint?.(ctx, op)
      definitions['mindmap.topic.collapse'].apply(ctx, op)
      return
  }
}

const whiteboardReducer = new Reducer<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
>({
  spec: {
    serializeKey: (key) => json.stableStringify(key),
    createContext: createWhiteboardReduceContext,
    handle: (ctx, op) => {
      runWhiteboardDefinition(ctx, op)
    },
    settle: (ctx) => {
      ctx.mindmap.flush()
    },
    done: finishWhiteboardReduce
  }
})

const buildWhiteboardDelta = (input: {
  before: Document
  after: Document
  operation: Operation
  changes: ChangeSet
}): MutationDeltaInput => {
  if (input.operation.type === 'document.replace') {
    return {
      reset: true
    }
  }

  const delta: MutationDeltaInput = {
    changes: {}
  }

  if (input.changes.background) {
    appendFlagChange(delta, 'document.background')
  }
  if (input.changes.canvasOrder) {
    appendFlagChange(delta, 'canvas.order')
  }

  appendIdsChange(delta, 'node.create', toSortedIds(input.changes.nodes, 'added'))
  appendIdsChange(delta, 'node.delete', toSortedIds(input.changes.nodes, 'removed'))
  appendIdsChange(delta, 'edge.create', toSortedIds(input.changes.edges, 'added'))
  appendIdsChange(delta, 'edge.delete', toSortedIds(input.changes.edges, 'removed'))
  appendIdsChange(delta, 'group.create', toSortedIds(input.changes.groups, 'added'))
  appendIdsChange(delta, 'group.delete', toSortedIds(input.changes.groups, 'removed'))
  appendIdsChange(delta, 'mindmap.create', toSortedIds(input.changes.mindmaps, 'added'))
  appendIdsChange(delta, 'mindmap.delete', toSortedIds(input.changes.mindmaps, 'removed'))

  const nodeGeometry = new Set<string>()
  const nodeOwner = new Set<string>()
  const nodeContent = new Set<string>()
  input.changes.nodes.updated.forEach((id) => {
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
  input.changes.edges.updated.forEach((id) => {
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

  const groupValue = new Set<string>()
  input.changes.groups.updated.forEach((id) => {
    const beforeGroup = input.before.groups[id]
    const afterGroup = input.after.groups[id]
    if (!beforeGroup || !afterGroup) {
      return
    }
    if (groupValueChanged(beforeGroup, afterGroup)) {
      groupValue.add(id)
    }
  })
  appendUpdatedChange(delta, 'group.value', groupValue)

  const mindmapStructure = new Set<string>()
  const mindmapLayout = new Set<string>()
  const mindmapMeta = new Set<string>()
  input.changes.mindmaps.updated.forEach((id) => {
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
    if (mindmapMetaChanged(beforeMindmap, afterMindmap)) {
      mindmapMeta.add(id)
    }
  })
  appendUpdatedChange(delta, 'mindmap.structure', mindmapStructure)
  appendUpdatedChange(delta, 'mindmap.layout', mindmapLayout)
  appendUpdatedChange(delta, 'mindmap.meta', mindmapMeta)

  if (Object.keys(delta.changes ?? {}).length === 0) {
    return {}
  }

  return delta
}

export const reduceWhiteboardOperations = (input: {
  document: Document
  operations: readonly Operation[]
  origin: MutationOrigin
}) => {
  const invalid = validateWhiteboardOperations(input)
  if (invalid) {
    return {
      ok: false as const,
      error: invalid
    }
  }

  return whiteboardReducer.reduce({
    doc: input.document,
    ops: input.operations,
    origin: input.origin
  })
}

const reduceWhiteboardOperation = (input: {
  document: Document
  operation: Operation
  origin: MutationOrigin
}) => reduceWhiteboardOperations({
  document: input.document,
  operations: [input.operation],
  origin: input.origin
})

const createCustomReducer = <
  TType extends Operation['type']
>(
  _type: TType
) => ({
  reduce: (
    input: MutationCustomReduceInput<
      Document,
      Extract<Operation, { type: TType }>,
      void,
      WhiteboardReduceIssueCode
    >
  ) => {
    const {
      op,
      document,
      origin,
      fail
    } = input
    const reduced = reduceWhiteboardOperation({
      document,
      operation: op,
      origin
    })
    if (!reduced.ok) {
      return fail(reduced.error)
    }

    if (!hasChanges(reduced.extra.changes)) {
      return
    }

    return {
      document: reduced.doc,
      delta: buildWhiteboardDelta({
        before: document,
        after: reduced.doc,
        operation: op,
        changes: reduced.extra.changes
      }),
      footprint: reduced.footprint,
      history: reduced.inverse.length > 0
        ? {
            inverse: reduced.inverse
          }
        : false as const
    }
  }
})

export const whiteboardCustom: MutationCustomTable<
  Document,
  Operation,
  void,
  WhiteboardReduceIssueCode
> = {
  'document.replace': createCustomReducer('document.replace'),
  'document.background': createCustomReducer('document.background'),
  'canvas.order.move': createCustomReducer('canvas.order.move'),
  'node.create': createCustomReducer('node.create'),
  'node.restore': createCustomReducer('node.restore'),
  'node.patch': createCustomReducer('node.patch'),
  'node.delete': createCustomReducer('node.delete'),
  'edge.create': createCustomReducer('edge.create'),
  'edge.restore': createCustomReducer('edge.restore'),
  'edge.patch': createCustomReducer('edge.patch'),
  'edge.label.insert': createCustomReducer('edge.label.insert'),
  'edge.label.delete': createCustomReducer('edge.label.delete'),
  'edge.label.move': createCustomReducer('edge.label.move'),
  'edge.label.patch': createCustomReducer('edge.label.patch'),
  'edge.route.point.insert': createCustomReducer('edge.route.point.insert'),
  'edge.route.point.delete': createCustomReducer('edge.route.point.delete'),
  'edge.route.point.move': createCustomReducer('edge.route.point.move'),
  'edge.route.point.patch': createCustomReducer('edge.route.point.patch'),
  'edge.delete': createCustomReducer('edge.delete'),
  'group.create': createCustomReducer('group.create'),
  'group.restore': createCustomReducer('group.restore'),
  'group.patch': createCustomReducer('group.patch'),
  'group.delete': createCustomReducer('group.delete'),
  'mindmap.create': createCustomReducer('mindmap.create'),
  'mindmap.restore': createCustomReducer('mindmap.restore'),
  'mindmap.delete': createCustomReducer('mindmap.delete'),
  'mindmap.move': createCustomReducer('mindmap.move'),
  'mindmap.layout': createCustomReducer('mindmap.layout'),
  'mindmap.topic.insert': createCustomReducer('mindmap.topic.insert'),
  'mindmap.topic.restore': createCustomReducer('mindmap.topic.restore'),
  'mindmap.topic.move': createCustomReducer('mindmap.topic.move'),
  'mindmap.topic.delete': createCustomReducer('mindmap.topic.delete'),
  'mindmap.topic.patch': createCustomReducer('mindmap.topic.patch'),
  'mindmap.branch.patch': createCustomReducer('mindmap.branch.patch'),
  'mindmap.topic.collapse': createCustomReducer('mindmap.topic.collapse')
}
