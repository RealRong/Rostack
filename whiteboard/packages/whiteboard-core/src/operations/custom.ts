import {
  equal,
  order
} from '@shared/core'
import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import type {
  MutationDeltaInput,
  MutationCustomTable,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationStructuralOrderedDeleteOperation,
  MutationStructuralOrderedInsertOperation,
  MutationStructuralOrderedMoveOperation,
  MutationStructuralOrderedSpliceOperation,
  MutationStructuralTreeDeleteOperation,
  MutationStructuralTreeInsertOperation,
  MutationStructuralTreeMoveOperation,
  MutationStructuralTreeRestoreOperation,
  MutationStructureSource,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot
} from '@shared/mutation'
import {
  createStructuralOrderedDeleteOperation,
  createStructuralOrderedInsertOperation,
  createStructuralOrderedMoveOperation,
  createStructuralOrderedSpliceOperation,
  createStructuralTreeDeleteOperation,
  createStructuralTreeInsertOperation,
  createStructuralTreeMoveOperation,
  createStructuralTreeRestoreOperation
} from '@shared/mutation'
import type {
  MutationCustomReduceInput
} from '@shared/mutation/engine'
import {
  applyStructuralOperation
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

type MindmapStructureValue = {
  side?: 'left' | 'right'
  collapsed?: boolean
  branchStyle: MindmapRecord['members'][NodeId]['branchStyle']
}

const CANVAS_REF_SEPARATOR = '\u0000'
const CANVAS_ORDER_STRUCTURE = 'canvas.order'
const EDGE_LABELS_STRUCTURE_PREFIX = 'edge.labels:'
const EDGE_ROUTE_STRUCTURE_PREFIX = 'edge.route:'
const MINDMAP_TREE_STRUCTURE_PREFIX = 'mindmap.tree:'

const canvasRefKey = (
  ref: CanvasItemRef
): string => `${ref.kind}${CANVAS_REF_SEPARATOR}${ref.id}`

const readCanvasRefFromKey = (
  value: string
): CanvasItemRef => {
  const index = value.indexOf(CANVAS_REF_SEPARATOR)
  if (index <= 0 || index >= value.length - 1) {
    throw new Error(`Invalid canvas ref key "${value}".`)
  }

  return {
    kind: value.slice(0, index) as CanvasItemRef['kind'],
    id: value.slice(index + CANVAS_REF_SEPARATOR.length)
  }
}

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

const readCanvasRefByKey = (
  order: readonly CanvasItemRef[],
  itemId: string
): CanvasItemRef | undefined => order.find((entry) => canvasRefKey(entry) === itemId)

const toStructuralOrderedAnchor = (
  anchor: EdgeLabelAnchor | EdgeRoutePointAnchor
): MutationOrderedAnchor => (
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

const toStructuralCanvasAnchor = (
  order: readonly CanvasItemRef[],
  movedRefs: readonly CanvasItemRef[],
  to: CanvasOrderAnchor
): MutationOrderedAnchor => {
  if (to.kind === 'front') {
    return {
      kind: 'start'
    }
  }
  if (to.kind === 'back') {
    return {
      kind: 'end'
    }
  }

  const movedKeys = new Set(movedRefs.map((ref) => canvasRefKey(ref)))
  const filtered = order.filter((entry) => !movedKeys.has(canvasRefKey(entry)))
  const anchorKey = canvasRefKey(to.ref)
  const anchorExists = filtered.some((entry) => canvasRefKey(entry) === anchorKey)
  if (!anchorExists) {
    return to.kind === 'before'
      ? {
          kind: 'start'
        }
      : {
          kind: 'end'
        }
  }

  return {
    kind: to.kind,
    itemId: anchorKey
  }
}

const fromStructuralCanvasAnchor = (
  order: readonly CanvasItemRef[],
  anchor: MutationOrderedAnchor
): CanvasOrderAnchor => {
  if (anchor.kind === 'start') {
    return {
      kind: 'front'
    }
  }
  if (anchor.kind === 'end') {
    return {
      kind: 'back'
    }
  }

  const ref = readCanvasRefByKey(order, anchor.itemId) ?? readCanvasRefFromKey(anchor.itemId)
  return {
    kind: anchor.kind,
    ref
  }
}

const applyCanvasOrderMove = (
  current: readonly CanvasItemRef[],
  ref: CanvasItemRef,
  to: CanvasOrderAnchor
): readonly CanvasItemRef[] => {
  const itemId = canvasRefKey(ref)
  const currentIds = current.map((entry) => canvasRefKey(entry))
  const nextIds = order.moveItem(currentIds, itemId, to.kind === 'before'
    ? {
        before: canvasRefKey(to.ref)
      }
    : to.kind === 'after'
      ? {
          before: readNextIdFromCanvasOrder(current, canvasRefKey(to.ref))
        }
      : to.kind === 'front'
        ? {
            before: currentIds.find((entryId) => entryId !== itemId)
          }
        : {})

  return nextIds.map((entryId) => (
    readCanvasRefByKey(current, entryId) ?? readCanvasRefFromKey(entryId)
  ))
}

const readNextIdFromCanvasOrder = (
  current: readonly CanvasItemRef[],
  itemId: string
): string | undefined => {
  const index = current.findIndex((entry) => canvasRefKey(entry) === itemId)
  return index >= 0
    ? current[index + 1]
      ? canvasRefKey(current[index + 1]!)
      : undefined
    : undefined
}

const fromStructuralEdgeLabelAnchor = (
  anchor: MutationOrderedAnchor
): EdgeLabelAnchor => (
  anchor.kind === 'start' || anchor.kind === 'end'
    ? anchor
    : anchor.kind === 'before'
      ? {
          kind: 'before',
          labelId: anchor.itemId
        }
      : {
          kind: 'after',
          labelId: anchor.itemId
        }
)

const fromStructuralEdgeRoutePointAnchor = (
  anchor: MutationOrderedAnchor
): EdgeRoutePointAnchor => (
  anchor.kind === 'start' || anchor.kind === 'end'
    ? anchor
    : anchor.kind === 'before'
      ? {
          kind: 'before',
          pointId: anchor.itemId
        }
      : {
          kind: 'after',
          pointId: anchor.itemId
        }
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

const createMindmapStructureValue = (
  member: MindmapRecord['members'][NodeId] | undefined,
  nodeId: NodeId
): MindmapStructureValue => {
  if (!member) {
    throw new Error(`Mindmap member ${nodeId} not found.`)
  }

  return {
    ...(member.side === undefined
      ? {}
      : {
          side: member.side
        }),
    ...(member.collapsed === undefined
      ? {}
      : {
          collapsed: member.collapsed
        }),
    branchStyle: clone(member.branchStyle)!
  }
}

const createMindmapTreeSnapshot = (
  record: MindmapRecord
): MutationTreeSnapshot<MindmapStructureValue> => ({
  rootIds: [record.root],
  nodes: Object.fromEntries(
    Object.entries(record.members).map(([nodeId, member]) => [
      nodeId,
      {
        ...(member.parentId === undefined
          ? {}
          : {
              parentId: member.parentId
            }),
        children: [...(record.children[nodeId as NodeId] ?? [])],
        value: createMindmapStructureValue(member, nodeId as NodeId)
      }
    ])
  )
})

const writeMindmapTreeSnapshot = (
  document: Document,
  id: MindmapId,
  tree: MutationTreeSnapshot<MindmapStructureValue>
): Document => {
  const current = document.mindmaps[id]
  if (!current) {
    throw new Error(`Mindmap ${id} not found.`)
  }
  if (tree.rootIds.length !== 1) {
    throw new Error(`Mindmap ${id} must contain exactly one root.`)
  }

  const rootId = tree.rootIds[0] as NodeId
  if (!tree.nodes[rootId]) {
    throw new Error(`Mindmap ${id} root ${rootId} not found in tree snapshot.`)
  }

  const members = Object.fromEntries(
    Object.entries(tree.nodes).map(([nodeId, node]) => {
      const value = node.value
      if (!value) {
        throw new Error(`Mindmap node ${nodeId} is missing structural value.`)
      }

      return [nodeId, {
        ...(node.parentId === undefined
          ? {}
          : {
              parentId: node.parentId
            }),
        ...(value.side === undefined
          ? {}
          : {
              side: value.side
            }),
        ...(value.collapsed === undefined
          ? {}
          : {
              collapsed: value.collapsed
            }),
        branchStyle: clone(value.branchStyle)!
      }]
    })
  ) as MindmapRecord['members']

  return {
    ...document,
    mindmaps: {
      ...document.mindmaps,
      [id]: {
        ...current,
        root: rootId,
        members,
        children: Object.fromEntries(
          Object.entries(tree.nodes).map(([nodeId, node]) => [
            nodeId,
            [...node.children]
          ])
        )
      }
    }
  }
}

const writeMindmapMemberSide = (
  document: Document,
  id: MindmapId,
  nodeId: NodeId,
  side: 'left' | 'right' | undefined
): Document => {
  const current = document.mindmaps[id]
  const member = current?.members[nodeId]
  if (!current || !member) {
    throw new Error(`Mindmap topic ${nodeId} not found in ${id}.`)
  }

  if (same(member.side, side)) {
    return document
  }

  const nextMember = side === undefined
    ? (() => {
        const {
          side: _ignored,
          ...rest
        } = member
        return rest
      })()
    : {
        ...member,
        side
      }

  return {
    ...document,
    mindmaps: {
      ...document.mindmaps,
      [id]: {
        ...current,
        members: {
          ...current.members,
          [nodeId]: nextMember
        }
      }
    }
  }
}

const resolveInsertedMindmapBranchStyle = (
  record: MindmapRecord,
  parentId: NodeId,
  side?: 'left' | 'right'
): MindmapRecord['members'][NodeId]['branchStyle'] => {
  const siblings = record.children[parentId] ?? []
  const siblingId = side
    ? siblings.find((childId) => record.members[childId]?.side === side)
    : siblings[0]
  const branch = siblingId
    ? record.members[siblingId]?.branchStyle
    : record.members[parentId]?.branchStyle

  return clone(
    branch ?? mindmapApi.template.defaultBranchStyle
  )!
}

const createMindmapTreeSubtreeSnapshot = (
  current: MindmapRecord,
  snapshot: MindmapTopicSnapshot
): MutationTreeSubtreeSnapshot<MindmapStructureValue> => ({
  rootId: snapshot.root,
  parentId: snapshot.slot.parent,
  index: snapshot.slot.prev
    ? ((current.children[snapshot.slot.parent] ?? []).indexOf(snapshot.slot.prev) + 1)
    : snapshot.slot.next
      ? Math.max((current.children[snapshot.slot.parent] ?? []).indexOf(snapshot.slot.next), 0)
      : (current.children[snapshot.slot.parent] ?? []).length,
  nodes: Object.fromEntries(
    Object.entries(snapshot.members).map(([nodeId, member]) => [
      nodeId,
      {
        ...(member.parentId === undefined
          ? {}
          : {
              parentId: member.parentId
            }),
        children: [...(snapshot.children[nodeId as NodeId] ?? [])],
        value: createMindmapStructureValue(member, nodeId as NodeId)
      }
    ])
  )
})

const whiteboardStructures: MutationStructureSource<Document> = (
  structure
) => {
  if (structure === CANVAS_ORDER_STRUCTURE) {
    return {
      kind: 'ordered',
      read: (document: Document) => document.canvas.order,
      identify: canvasRefKey,
      clone: (ref: CanvasItemRef) => cloneCanvasRef(ref)!,
      write: (document: Document, items: readonly CanvasItemRef[]) => ({
        ...document,
        canvas: {
          ...document.canvas,
          order: items.map((item) => cloneCanvasRef(item)!)
        }
      })
    }
  }

  if (structure.startsWith(EDGE_LABELS_STRUCTURE_PREFIX)) {
    const edgeId = structure.slice(EDGE_LABELS_STRUCTURE_PREFIX.length) as EdgeId
    return {
      kind: 'ordered',
      read: (document: Document) => {
        const edge = document.edges[edgeId]
        if (!edge) {
          throw new Error(`Edge ${edgeId} not found.`)
        }
        return getLabels(edge)
      },
      identify: (label: EdgeLabel) => label.id,
      clone: (label: EdgeLabel) => clone(label)!,
      write: (document: Document, items: readonly EdgeLabel[]) => {
        const edge = document.edges[edgeId]
        if (!edge) {
          throw new Error(`Edge ${edgeId} not found.`)
        }
        return {
          ...document,
          edges: {
            ...document.edges,
            [edgeId]: {
              ...edge,
              labels: items.map((item) => clone(item)!)
            }
          }
        }
      }
    }
  }

  if (structure.startsWith(EDGE_ROUTE_STRUCTURE_PREFIX)) {
    const edgeId = structure.slice(EDGE_ROUTE_STRUCTURE_PREFIX.length) as EdgeId
    return {
      kind: 'ordered',
      read: (document: Document) => {
        const edge = document.edges[edgeId]
        if (!edge) {
          throw new Error(`Edge ${edgeId} not found.`)
        }
        return getManualRoutePoints(edge)
      },
      identify: (point: EdgeRoutePoint) => point.id,
      clone: (point: EdgeRoutePoint) => clone(point)!,
      write: (document: Document, items: readonly EdgeRoutePoint[]) => {
        const edge = document.edges[edgeId]
        if (!edge) {
          throw new Error(`Edge ${edgeId} not found.`)
        }
        return {
          ...document,
          edges: {
            ...document.edges,
            [edgeId]: {
              ...edge,
              route: items.length > 0
                ? {
                    kind: 'manual',
                    points: items.map((item) => clone(item)!)
                  }
                : {
                    kind: 'auto'
                  }
            }
          }
        }
      }
    }
  }

  if (structure.startsWith(MINDMAP_TREE_STRUCTURE_PREFIX)) {
    const mindmapId = structure.slice(MINDMAP_TREE_STRUCTURE_PREFIX.length) as MindmapId
    return {
      kind: 'tree',
      read: (document: Document) => {
        const record = document.mindmaps[mindmapId]
        if (!record) {
          throw new Error(`Mindmap ${mindmapId} not found.`)
        }
        return createMindmapTreeSnapshot(record)
      },
      clone: (value: MindmapStructureValue) => clone(value)!,
      write: (document: Document, tree: MutationTreeSnapshot<MindmapStructureValue>) => (
        writeMindmapTreeSnapshot(document, mindmapId, tree)
      )
    }
  }

  return undefined
}

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

const readCanvasOrderAnchorFromSlot = (
  slot: {
    prev?: CanvasItemRef
    next?: CanvasItemRef
  } | undefined
): MutationOrderedAnchor => (
  slot?.prev
    ? {
        kind: 'after',
        itemId: canvasRefKey(slot.prev)
      }
    : slot?.next
      ? {
          kind: 'before',
          itemId: canvasRefKey(slot.next)
        }
      : {
          kind: 'end'
        }
)

const readStructuralDocument = <TOperation extends {
  type: string
}>(input: {
  document: Document
  operation: TOperation
  fail: WhiteboardCustomReduceContext['fail']
}): {
  document: Document
  inverse: readonly TOperation[]
  footprint: readonly MutationFootprint[]
  historyMode: 'track' | 'skip' | 'neutral'
} => {
  const result = applyStructuralOperation<Document, TOperation, WhiteboardCustomCode>({
    document: input.document,
    operation: input.operation,
    structures: whiteboardStructures
  })
  if (!result.ok) {
    return input.fail({
      code: 'invalid',
      message: result.error.message
    })
  }

  return {
    document: result.data.document,
    inverse: result.data.inverse,
    footprint: result.data.footprint,
    historyMode: result.data.historyMode
  }
}

const insertCanvasOrderRef = (input: {
  document: Document
  ref: CanvasItemRef
  to: MutationOrderedAnchor
  fail: WhiteboardCustomReduceContext['fail']
}) => readStructuralDocument({
  document: input.document,
  operation: createStructuralOrderedInsertOperation<MutationStructuralOrderedInsertOperation>({
    structure: CANVAS_ORDER_STRUCTURE,
    itemId: canvasRefKey(input.ref),
    value: cloneCanvasRef(input.ref)!,
    to: input.to
  }),
  fail: input.fail
})

const deleteCanvasOrderRef = (input: {
  document: Document
  ref: CanvasItemRef
  fail: WhiteboardCustomReduceContext['fail']
}) => readStructuralDocument({
  document: input.document,
  operation: createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
    structure: CANVAS_ORDER_STRUCTURE,
    itemId: canvasRefKey(input.ref)
  }),
  fail: input.fail
})

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
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const before = input.document
  const nextBase = insertCanvasOrderRef({
    document: {
      ...before,
      nodes: {
        ...before.nodes,
        ...Object.fromEntries(input.op.nodes.map((node) => [node.id, clone(node)!]))
      },
      mindmaps: {
        ...before.mindmaps,
        [input.op.mindmap.id]: clone(input.op.mindmap)!
      }
    },
    ref: {
      kind: 'mindmap',
      id: input.op.mindmap.id
    },
    to: {
      kind: 'end'
    },
    fail: input.fail
  })

  return createWhiteboardCustomResult({
    document: nextBase.document,
    delta: mergeDelta(
      createNodeCreateDelta(input.op.nodes.map((node) => node.id)),
      createMindmapCreateDelta([input.op.mindmap.id]),
      createCanvasOrderDelta(nextBase.historyMode !== 'neutral')
    ),
    footprint: [
      ...createEntityFootprints('node', input.op.nodes.map((node) => node.id)),
      ...createEntityFootprints('mindmap', [input.op.mindmap.id]),
      ...nextBase.footprint
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
    fail: WhiteboardCustomReduceContext['fail']
  }
): CustomResult => {
  const before = input.document
  const nextBase = insertCanvasOrderRef({
    document: {
      ...before,
      nodes: {
        ...before.nodes,
        ...Object.fromEntries(input.op.snapshot.nodes.map((node) => [node.id, clone(node)!]))
      },
      mindmaps: {
        ...before.mindmaps,
        [input.op.snapshot.mindmap.id]: clone(input.op.snapshot.mindmap)!
      }
    },
    ref: {
      kind: 'mindmap',
      id: input.op.snapshot.mindmap.id
    },
    to: readCanvasOrderAnchorFromSlot(input.op.snapshot.slot),
    fail: input.fail
  })

  return createWhiteboardCustomResult({
    document: nextBase.document,
    delta: mergeDelta(
      createNodeCreateDelta(input.op.snapshot.nodes.map((node) => node.id)),
      createMindmapCreateDelta([input.op.snapshot.mindmap.id]),
      createCanvasOrderDelta(nextBase.historyMode !== 'neutral')
    ),
    footprint: [
      ...createEntityFootprints('node', input.op.snapshot.nodes.map((node) => node.id)),
      ...createEntityFootprints('mindmap', [input.op.snapshot.mindmap.id]),
      ...nextBase.footprint
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
    fail: WhiteboardCustomReduceContext['fail']
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

  let nextBase: Document = {
    ...before,
    nodes: {
      ...before.nodes,
    },
    edges: {
      ...before.edges
    },
    mindmaps: Object.fromEntries(
      Object.entries(before.mindmaps).filter(([id]) => id !== input.op.id)
    )
  }
  nodeIds.forEach((nodeId) => {
    delete nextBase.nodes[nodeId]
  })
  edgeIds.forEach((edgeId) => {
    delete nextBase.edges[edgeId]
  })

  const footprint: MutationFootprint[] = []
  const removedMindmap = deleteCanvasOrderRef({
    document: nextBase,
    ref: {
      kind: 'mindmap',
      id: input.op.id
    },
    fail: input.fail
  })
  nextBase = removedMindmap.document
  footprint.push(...removedMindmap.footprint)

  connectedEdges.forEach((edge) => {
    const removedEdge = deleteCanvasOrderRef({
      document: nextBase,
      ref: {
        kind: 'edge',
        id: edge.id
      },
      fail: input.fail
    })
    nextBase = removedEdge.document
    footprint.push(...removedEdge.footprint)
  })

  const inverse: Operation[] = [{
    type: 'mindmap.restore',
    snapshot
  }]
  connectedEdges.forEach((edge) => {
    const slot = reader.canvas.slot({
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
      createMindmapDeleteDelta([input.op.id]),
      createCanvasOrderDelta(removedMindmap.historyMode !== 'neutral' || edgeIds.length > 0)
    ),
    footprint: [
      ...createEntityFootprints('node', [...nodeIds]),
      ...createEntityFootprints('edge', edgeIds),
      ...createEntityFootprints('mindmap', [input.op.id]),
      ...footprint
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

  const structure = `${MINDMAP_TREE_STRUCTURE_PREFIX}${input.op.id}`
  const before = {
    ...input.document,
    nodes: {
      ...input.document.nodes,
      [input.op.node.id]: clone(input.op.node)!
    }
  }
  let resultDocument = before
  const footprint: MutationFootprint[] = []

  switch (input.op.input.kind) {
    case 'child': {
      if (!current.members[input.op.input.parentId]) {
        return input.fail({
          code: 'invalid',
          message: `Parent node ${input.op.input.parentId} not found.`
        })
      }

      const side = input.op.input.parentId === current.root
        ? (input.op.input.options?.side ?? 'right')
        : undefined
      const result = readStructuralDocument({
        document: resultDocument,
        operation: createStructuralTreeInsertOperation<MutationStructuralTreeInsertOperation>({
          structure,
          nodeId: input.op.node.id,
          parentId: input.op.input.parentId,
          index: input.op.input.options?.index,
          value: {
            ...(side === undefined
              ? {}
              : {
                  side
                }),
            branchStyle: resolveInsertedMindmapBranchStyle(current, input.op.input.parentId, side)
          }
        }),
        fail: input.fail
      })
      resultDocument = result.document
      footprint.push(...result.footprint)
      break
    }
    case 'sibling': {
      const target = current.members[input.op.input.nodeId]
      const parentId = target?.parentId
      if (!target || !parentId) {
        return input.fail({
          code: 'invalid',
          message: `Node ${input.op.input.nodeId} cannot create a sibling.`
        })
      }

      const siblings = current.children[parentId] ?? []
      const currentIndex = siblings.indexOf(input.op.input.nodeId)
      const side = parentId === current.root
        ? (target.side ?? 'right')
        : undefined
      const result = readStructuralDocument({
        document: resultDocument,
        operation: createStructuralTreeInsertOperation<MutationStructuralTreeInsertOperation>({
          structure,
          nodeId: input.op.node.id,
          parentId,
          index: currentIndex < 0
            ? undefined
            : input.op.input.position === 'before'
              ? currentIndex
              : currentIndex + 1,
          value: {
            ...(side === undefined
              ? {}
              : {
                  side
                }),
            branchStyle: resolveInsertedMindmapBranchStyle(current, parentId, target.side)
          }
        }),
        fail: input.fail
      })
      resultDocument = result.document
      footprint.push(...result.footprint)
      break
    }
    case 'parent': {
      if (input.op.input.nodeId === current.root) {
        return input.fail({
          code: 'invalid',
          message: 'Root node cannot be wrapped.'
        })
      }

      const target = current.members[input.op.input.nodeId]
      const parentId = target?.parentId
      if (!target || !parentId) {
        return input.fail({
          code: 'invalid',
          message: `Node ${input.op.input.nodeId} not found.`
        })
      }

      const siblingIndex = (current.children[parentId] ?? []).indexOf(input.op.input.nodeId)
      if (siblingIndex < 0) {
        return input.fail({
          code: 'invalid',
          message: `Node ${input.op.input.nodeId} is detached.`
        })
      }

      const side = parentId === current.root
        ? (target.side ?? input.op.input.options?.side ?? 'right')
        : undefined
      const insertResult = readStructuralDocument({
        document: resultDocument,
        operation: createStructuralTreeInsertOperation<MutationStructuralTreeInsertOperation>({
          structure,
          nodeId: input.op.node.id,
          parentId,
          index: siblingIndex,
          value: {
            ...(side === undefined
              ? {}
              : {
                  side
                }),
            branchStyle: resolveInsertedMindmapBranchStyle(current, parentId, target.side)
          }
        }),
        fail: input.fail
      })
      const moveResult = readStructuralDocument({
        document: insertResult.document,
        operation: createStructuralTreeMoveOperation<MutationStructuralTreeMoveOperation>({
          structure,
          nodeId: input.op.input.nodeId,
          parentId: input.op.node.id,
          index: 0
        }),
        fail: input.fail
      })
      resultDocument = writeMindmapMemberSide(
        moveResult.document,
        input.op.id,
        input.op.input.nodeId,
        undefined
      )
      footprint.push(...insertResult.footprint, ...moveResult.footprint)
      break
    }
  }

  return createWhiteboardCustomResult({
    document: resultDocument,
    delta: mergeDelta(
      createNodeCreateDelta([input.op.node.id]),
      createMindmapStructureDelta([input.op.id])
    ),
    footprint: [
      ...createEntityFootprints('node', [input.op.node.id]),
      ...footprint,
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

  const restored = readStructuralDocument({
    document: input.document,
    operation: createStructuralTreeRestoreOperation<MutationStructuralTreeRestoreOperation>({
      structure: `${MINDMAP_TREE_STRUCTURE_PREFIX}${input.op.id}`,
      snapshot: createMindmapTreeSubtreeSnapshot(current, input.op.snapshot)
    }),
    fail: input.fail
  })

  const nextBase: Document = {
    ...restored.document,
    nodes: {
      ...restored.document.nodes,
      ...Object.fromEntries(input.op.snapshot.nodes.map((node) => [node.id, clone(node)!]))
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
      ...restored.footprint,
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
): CustomResult | void => {
  const reader = createDocumentReader(() => input.document)
  const current = reader.mindmaps.get(input.op.id)
  if (!current) {
    return input.fail({
      code: 'invalid',
      message: `Mindmap ${input.op.id} not found.`
    })
  }

  const member = current.members[input.op.input.nodeId]
  if (!member?.parentId) {
    return input.fail({
      code: 'invalid',
      message: `Topic ${input.op.input.nodeId} cannot move.`
    })
  }

  const prevSiblings = current.children[member.parentId] ?? []
  const prevIndex = prevSiblings.indexOf(input.op.input.nodeId)
  const nextSide = input.op.input.parentId === current.root
    ? (input.op.input.side ?? member.side ?? 'right')
    : undefined
  const moved = readStructuralDocument({
    document: input.document,
    operation: createStructuralTreeMoveOperation<MutationStructuralTreeMoveOperation>({
      structure: `${MINDMAP_TREE_STRUCTURE_PREFIX}${input.op.id}`,
      nodeId: input.op.input.nodeId,
      parentId: input.op.input.parentId,
      index: input.op.input.index
    }),
    fail: input.fail
  })
  const nextBase = writeMindmapMemberSide(
    moved.document,
    input.op.id,
    input.op.input.nodeId,
    nextSide
  )
  const sideChanged = !same(member.side, nextSide)
  if (moved.historyMode === 'neutral' && !sideChanged) {
    return
  }
  const inverse = moved.inverse[0]
  const inverseParentId = inverse?.type === 'structural.tree.move'
    ? inverse.parentId
    : member.parentId
  const inverseIndex = inverse?.type === 'structural.tree.move'
    ? inverse.index
    : (prevIndex < 0 ? undefined : prevIndex)

  return createWhiteboardCustomResult({
    document: nextBase,
    delta: mergeDelta(
      createMindmapStructureDelta([input.op.id])
    ),
    footprint: [
      ...moved.footprint,
      fieldKey('mindmap', input.op.id, 'structure')
    ],
    history: {
      inverse: [{
        type: 'mindmap.topic.move',
        id: input.op.id,
        input: {
          nodeId: input.op.input.nodeId,
          parentId: inverseParentId ?? member.parentId,
          index: inverseIndex,
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
  const removed = readStructuralDocument({
    document: before,
    operation: createStructuralTreeDeleteOperation<MutationStructuralTreeDeleteOperation>({
      structure: `${MINDMAP_TREE_STRUCTURE_PREFIX}${input.op.id}`,
      nodeId: input.op.input.nodeId
    }),
    fail: input.fail
  })

  const nextNodes = {
    ...removed.document.nodes
  }
  nodeIds.forEach((nodeId) => {
    delete nextNodes[nodeId]
  })
  const nextEdges = {
    ...removed.document.edges
  }
  edgeIds.forEach((edgeId) => {
    delete nextEdges[edgeId]
  })
  let nextBase: Document = {
    ...removed.document,
    nodes: nextNodes,
    edges: nextEdges
  }
  const canvasFootprint: MutationFootprint[] = []
  connectedEdges.forEach((edge) => {
    const removedEdge = deleteCanvasOrderRef({
      document: nextBase,
      ref: {
        kind: 'edge',
        id: edge.id
      },
      fail: input.fail
    })
    nextBase = removedEdge.document
    canvasFootprint.push(...removedEdge.footprint)
  })

  const inverse: Operation[] = [{
    type: 'mindmap.topic.restore',
    id: input.op.id,
    snapshot
  }]
  connectedEdges.forEach((edge) => {
    const slot = reader.canvas.slot({
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
      ...removed.footprint,
      ...canvasFootprint,
      fieldKey('mindmap', input.op.id, 'structure')
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
  const existingRefs = input.op.refs.filter((ref) => (
    currentOrder.some((entry) => canvasRefKey(entry) === canvasRefKey(ref))
  ))
  if (existingRefs.length === 0) {
    return
  }

  const firstAnchor = toStructuralCanvasAnchor(currentOrder, existingRefs, input.op.to)
  const result = existingRefs.length === 1
    ? readStructuralDocument({
        document: input.document,
        operation: createStructuralOrderedMoveOperation<MutationStructuralOrderedMoveOperation>({
          structure: CANVAS_ORDER_STRUCTURE,
          itemId: canvasRefKey(existingRefs[0]!),
          to: firstAnchor
        }),
        fail: input.fail
      })
    : readStructuralDocument({
        document: input.document,
        operation: createStructuralOrderedSpliceOperation<MutationStructuralOrderedSpliceOperation>({
          structure: CANVAS_ORDER_STRUCTURE,
          itemIds: existingRefs.map((ref) => canvasRefKey(ref)),
          to: firstAnchor
        }),
        fail: input.fail
      })

  if (result.historyMode === 'neutral') {
    return
  }

  const inverse = existingRefs.length === 1
    ? (() => {
        const inverseMove = result.inverse[0]
        if (inverseMove?.type !== 'structural.ordered.move') {
          return input.fail({
            code: 'invalid',
            message: 'Canvas order move inverse is invalid.'
          })
        }

        return [{
          type: 'canvas.order.move',
          refs: existingRefs.map((ref) => cloneCanvasRef(ref)!),
          to: fromStructuralCanvasAnchor(currentOrder, inverseMove.to)
        } satisfies Operation]
      })()
    : (() => {
        const inverseOps: Operation[] = []
        let working: readonly CanvasItemRef[] = result.document.canvas.order

        result.inverse.forEach((inverseOp) => {
          if (inverseOp.type !== 'structural.ordered.move') {
            return
          }

          const ref = readCanvasRefFromKey(inverseOp.itemId)
          const to = fromStructuralCanvasAnchor(working, inverseOp.to)
          inverseOps.push({
            type: 'canvas.order.move',
            refs: [ref],
            to
          })
          working = applyCanvasOrderMove(working, ref, to)
        })

        return inverseOps
      })()

  return createWhiteboardCustomResult({
    document: result.document,
    delta: mergeDelta(
      createCanvasOrderDelta()
    ),
    footprint: result.footprint,
    history: {
      inverse
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

  const result = readStructuralDocument({
    document: input.document,
    operation: createStructuralOrderedInsertOperation<MutationStructuralOrderedInsertOperation>({
      structure: `${EDGE_LABELS_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.label.id,
      value: clone(input.op.label)!,
      to: toStructuralOrderedAnchor(input.op.to)
    }),
    fail: input.fail
  })

  return createWhiteboardCustomResult({
    document: result.document,
    delta: mergeDelta(
      createEdgeLabelsDelta([input.op.edgeId])
    ),
    footprint: result.footprint,
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
  if (!current || !getLabels(current).some((label) => label.id === input.op.labelId)) {
    return
  }

  const result = readStructuralDocument({
    document: input.document,
    operation: createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
      structure: `${EDGE_LABELS_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.labelId
    }),
    fail: input.fail
  })
  const inverse = result.inverse[0] as unknown as MutationStructuralOrderedInsertOperation | undefined
  if (!inverse) {
    return input.fail({
      code: 'invalid',
      message: 'Edge label delete inverse is invalid.'
    })
  }

  return createWhiteboardCustomResult({
    document: result.document,
    delta: mergeDelta(
      createEdgeLabelsDelta([input.op.edgeId])
    ),
    footprint: result.footprint,
    history: {
      inverse: [{
        type: 'edge.label.insert',
        edgeId: input.op.edgeId,
        label: clone(inverse.value as EdgeLabel)!,
        to: fromStructuralEdgeLabelAnchor(inverse.to)
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
  if (!current || !getLabels(current).some((label) => label.id === input.op.labelId)) {
    return
  }

  const result = readStructuralDocument({
    document: input.document,
    operation: createStructuralOrderedMoveOperation<MutationStructuralOrderedMoveOperation>({
      structure: `${EDGE_LABELS_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.labelId,
      to: toStructuralOrderedAnchor(input.op.to)
    }),
    fail: input.fail
  })
  if (result.historyMode === 'neutral') {
    return
  }
  const inverse = result.inverse[0]
  if (inverse?.type !== 'structural.ordered.move') {
    return input.fail({
      code: 'invalid',
      message: 'Edge label move inverse is invalid.'
    })
  }

  return createWhiteboardCustomResult({
    document: result.document,
    delta: mergeDelta(
      createEdgeLabelsDelta([input.op.edgeId])
    ),
    footprint: result.footprint,
    history: {
      inverse: [{
        type: 'edge.label.move',
        edgeId: input.op.edgeId,
        labelId: input.op.labelId,
        to: fromStructuralEdgeLabelAnchor(inverse.to)
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

  const result = readStructuralDocument({
    document: input.document,
    operation: createStructuralOrderedInsertOperation<MutationStructuralOrderedInsertOperation>({
      structure: `${EDGE_ROUTE_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.point.id,
      value: clone(input.op.point)!,
      to: toStructuralOrderedAnchor(input.op.to)
    }),
    fail: input.fail
  })

  return createWhiteboardCustomResult({
    document: result.document,
    delta: mergeDelta(
      createEdgeRouteDelta([input.op.edgeId])
    ),
    footprint: result.footprint,
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
  if (!current || !getManualRoutePoints(current).some((point) => point.id === input.op.pointId)) {
    return
  }

  const result = readStructuralDocument({
    document: input.document,
    operation: createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
      structure: `${EDGE_ROUTE_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.pointId
    }),
    fail: input.fail
  })
  const inverse = result.inverse[0] as unknown as MutationStructuralOrderedInsertOperation | undefined
  if (!inverse) {
    return input.fail({
      code: 'invalid',
      message: 'Edge route point delete inverse is invalid.'
    })
  }

  return createWhiteboardCustomResult({
    document: result.document,
    delta: mergeDelta(
      createEdgeRouteDelta([input.op.edgeId])
    ),
    footprint: result.footprint,
    history: {
      inverse: [{
        type: 'edge.route.point.insert',
        edgeId: input.op.edgeId,
        point: clone(inverse.value as EdgeRoutePoint)!,
        to: fromStructuralEdgeRoutePointAnchor(inverse.to)
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
  if (!current || !getManualRoutePoints(current).some((point) => point.id === input.op.pointId)) {
    return
  }

  const result = readStructuralDocument({
    document: input.document,
    operation: createStructuralOrderedMoveOperation<MutationStructuralOrderedMoveOperation>({
      structure: `${EDGE_ROUTE_STRUCTURE_PREFIX}${input.op.edgeId}`,
      itemId: input.op.pointId,
      to: toStructuralOrderedAnchor(input.op.to)
    }),
    fail: input.fail
  })
  if (result.historyMode === 'neutral') {
    return
  }
  const inverse = result.inverse[0]
  if (inverse?.type !== 'structural.ordered.move') {
    return input.fail({
      code: 'invalid',
      message: 'Edge route point move inverse is invalid.'
    })
  }

  return createWhiteboardCustomResult({
    document: result.document,
    delta: mergeDelta(
      createEdgeRouteDelta([input.op.edgeId])
    ),
    footprint: result.footprint,
    history: {
      inverse: [{
        type: 'edge.route.point.move',
        edgeId: input.op.edgeId,
        pointId: input.op.pointId,
        to: fromStructuralEdgeRoutePointAnchor(inverse.to)
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
    reduce: ({ op, document, fail }) => createMindmapResult({
      op,
      document,
      fail
    })
  },
  'mindmap.restore': {
    reduce: ({ op, document, fail }) => createMindmapRestoreResult({
      op,
      document,
      fail
    })
  },
  'mindmap.delete': {
    reduce: ({ op, document, fail }) => createMindmapDeleteResult({
      op,
      document,
      fail
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
