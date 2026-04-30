import {
  record as draftRecord,
  type RecordWrite
} from '@shared/draft'
import type {
  MutationFootprint,
  MutationOrderedAnchor,
  MutationStructuralCanonicalOperation,
  MutationStructuralOrderedDeleteOperation,
  MutationStructuralOrderedInsertOperation,
  MutationStructuralOrderedMoveOperation,
  MutationStructureSource,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot
} from '@shared/mutation'
import {
  createStructuralOrderedDeleteOperation,
  createStructuralOrderedInsertOperation,
  readStructuralOperation,
  readStructuralOperationResult
} from '@shared/mutation/engine'
import {
  createDocumentReader,
  type DocumentReader
} from '@whiteboard/core/document/reader'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  CanvasItemRef,
  CanvasOrderAnchor,
  Document,
  Edge,
  EdgeId,
  EdgeLabel,
  EdgeLabelAnchor,
  EdgeRoutePoint,
  EdgeRoutePointAnchor,
  MindmapId,
  MindmapRecord,
  MindmapTopicSnapshot,
  NodeId,
  Point
} from '@whiteboard/core/types'
import {
  clone,
  same,
  uniqueSorted
} from './common'
import type {
  WhiteboardCustomCode,
  WhiteboardCustomPlanContext
} from './types'

type MindmapStructureValue = {
  side?: 'left' | 'right'
  collapsed?: boolean
  branchStyle: MindmapRecord['members'][NodeId]['branchStyle']
}

const CANVAS_REF_SEPARATOR = '\u0000'
export const CANVAS_ORDER_STRUCTURE = 'canvas.order'
export const EDGE_LABELS_STRUCTURE_PREFIX = 'edge.labels:'
export const EDGE_ROUTE_STRUCTURE_PREFIX = 'edge.route:'
export const MINDMAP_TREE_STRUCTURE_PREFIX = 'mindmap.tree:'

export const canvasRefKey = (
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

export const toStructuralOrderedAnchor = (
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

export const toStructuralCanvasAnchor = (
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

export const applyCanvasOrderMove = (
  current: readonly CanvasItemRef[],
  ref: CanvasItemRef,
  to: CanvasOrderAnchor
): readonly CanvasItemRef[] => {
  const itemId = canvasRefKey(ref)
  const currentIds = current.map((entry) => canvasRefKey(entry))
  const nextIds = currentIds.includes(itemId)
    ? [...currentIds]
    : currentIds

  const without = nextIds.filter((entryId) => entryId !== itemId)
  let insertIndex = without.length
  if (to.kind === 'before') {
    insertIndex = Math.max(without.indexOf(canvasRefKey(to.ref)), 0)
  } else if (to.kind === 'after') {
    const nextId = readNextIdFromCanvasOrder(current, canvasRefKey(to.ref))
    insertIndex = nextId
      ? Math.max(without.indexOf(nextId), 0)
      : without.length
  } else if (to.kind === 'front') {
    insertIndex = 0
  }

  without.splice(insertIndex, 0, itemId)
  return without.map((entryId) => (
    readCanvasRefByKey(current, entryId) ?? readCanvasRefFromKey(entryId)
  ))
}

export const fromStructuralCanvasAnchor = (
  order: readonly CanvasItemRef[],
  anchor: MutationOrderedAnchor
): CanvasOrderAnchor => (
  anchor.kind === 'start'
    ? { kind: 'front' }
    : anchor.kind === 'end'
      ? { kind: 'back' }
      : {
          kind: anchor.kind,
          ref: readCanvasRefByKey(order, anchor.itemId) ?? readCanvasRefFromKey(anchor.itemId)
        }
)

export const fromStructuralEdgeLabelAnchor = (
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

export const fromStructuralEdgeRoutePointAnchor = (
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

export const getLabels = (
  edge: Edge
): readonly EdgeLabel[] => edge.labels ?? []

export const getManualRoutePoints = (
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
    ...(member.side === undefined ? {} : { side: member.side }),
    ...(member.collapsed === undefined ? {} : { collapsed: member.collapsed }),
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
        ...(member.parentId === undefined ? {} : { parentId: member.parentId }),
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
        ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
        ...(value.side === undefined ? {} : { side: value.side }),
        ...(value.collapsed === undefined ? {} : { collapsed: value.collapsed }),
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

export const writeMindmapMemberSide = (
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

export const resolveInsertedMindmapBranchStyle = (
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

export const createMindmapTreeSubtreeSnapshot = (
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
        ...(member.parentId === undefined ? {} : { parentId: member.parentId }),
        children: [...(snapshot.children[nodeId as NodeId] ?? [])],
        value: createMindmapStructureValue(member, nodeId as NodeId)
      }
    ])
  )
})

export const whiteboardStructures: MutationStructureSource<Document> = (
  structure
) => {
  if (structure === CANVAS_ORDER_STRUCTURE) {
    return {
      kind: 'ordered',
      change: [{
        key: 'canvas.order',
        change: {
          order: true
        }
      }],
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
      change: [{
        key: 'edge.labels',
        change: [edgeId]
      }],
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
      change: [{
        key: 'edge.route',
        change: [edgeId]
      }],
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
      change: [{
        key: 'mindmap.structure',
        change: [mindmapId]
      }],
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

export const readMindmapLayoutChangedNodeIds = (input: {
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

export const readCanvasOrderAnchorFromSlot = (
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

export const readStructuralDocument = <TOperation extends {
  type: string
}>(input: {
  document: Document
  operation: TOperation
  fail: WhiteboardCustomPlanContext['fail']
}): {
  document: Document
  inverse: readonly TOperation[]
  footprint: readonly MutationFootprint[]
  historyMode: 'track' | 'skip' | 'neutral'
} => {
  const descriptor = readStructuralOperation(input.operation.type)
  if (!descriptor) {
    return input.fail({
      code: 'invalid',
      message: `Unknown structural operation "${input.operation.type}".`
    })
  }

  const result = readStructuralOperationResult<Document, TOperation, WhiteboardCustomCode>({
    document: input.document,
    operation: input.operation,
    structures: whiteboardStructures,
    descriptor
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

export const insertCanvasOrderRef = (input: {
  document: Document
  ref: CanvasItemRef
  to: MutationOrderedAnchor
  fail: WhiteboardCustomPlanContext['fail']
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

export const deleteCanvasOrderRef = (input: {
  document: Document
  ref: CanvasItemRef
  fail: WhiteboardCustomPlanContext['fail']
}) => readStructuralDocument({
  document: input.document,
  operation: createStructuralOrderedDeleteOperation<MutationStructuralOrderedDeleteOperation>({
    structure: CANVAS_ORDER_STRUCTURE,
    itemId: canvasRefKey(input.ref)
  }),
  fail: input.fail
})

export const createEntityFootprints = (
  family: 'node' | 'edge' | 'group' | 'mindmap',
  ids: readonly string[]
): MutationFootprint[] => ids.map((id) => ({
  kind: 'entity',
  family,
  id
}))

export const writeRecord = <T extends object>(
  current: T,
  record: RecordWrite
): T => draftRecord.apply(current, record)
