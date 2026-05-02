import type {
  MutationOrderedAnchor,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot
} from '@shared/mutation/engine'
import {
  defineMutationRegistry
} from '@shared/mutation/engine'
import {
  draft
} from '@shared/draft'
import {
  whiteboardEntities
} from '@whiteboard/core/mutation/entities'
import {
  createEdgeLabelPatch,
  readEdgeLabelUpdateFromPatch
} from '@whiteboard/core/edge/update'
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
  EdgeLabelFieldPatch,
  EdgeLabelPatch,
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
} from '@whiteboard/core/mutation/common'

export type WhiteboardMindmapTreeValue = {
  side?: 'left' | 'right'
  collapsed?: boolean
  branchStyle: MindmapRecord['members'][NodeId]['branchStyle']
}

const CANVAS_REF_SEPARATOR = '\u0000'

export const canvasRefKey = (
  ref: CanvasItemRef
): string => `${ref.kind}${CANVAS_REF_SEPARATOR}${ref.id}`

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

const applyEdgeLabelPatch = (
  label: EdgeLabel,
  patch: EdgeLabelPatch
): EdgeLabel => {
  const update = readEdgeLabelUpdateFromPatch(patch)
  let next = clone(label)!

  if (update.fields) {
    if ('text' in update.fields) {
      next.text = clone(update.fields.text)
    }
    if ('t' in update.fields) {
      next.t = clone(update.fields.t)
    }
    if ('offset' in update.fields) {
      next.offset = clone(update.fields.offset)
    }
  }
  if (update.record) {
    next = draft.record.apply(next, update.record)
  }

  return next
}

const diffEdgeLabelPatch = (
  before: EdgeLabel,
  after: EdgeLabel
): EdgeLabelPatch => {
  const writes = draft.record.diff(before, after)
  const fields: EdgeLabelFieldPatch = {}
  const record: Record<string, unknown> = {}

  Object.entries(writes).forEach(([path, value]) => {
    if (path === 'text' || path === 't' || path === 'offset') {
      fields[path] = clone(value) as never
      return
    }
    record[path] = clone(value)
  })

  return createEdgeLabelPatch({
    ...(Object.keys(fields).length === 0
      ? {}
      : {
          fields
        }),
    ...(Object.keys(record).length === 0
      ? {}
      : {
          record
        })
  })
}

export const toMutationOrderedAnchor = (
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

export const toCanvasOrderAnchor = (
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
): WhiteboardMindmapTreeValue => {
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
): MutationTreeSnapshot<WhiteboardMindmapTreeValue> => ({
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
  tree: MutationTreeSnapshot<WhiteboardMindmapTreeValue>
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
): MutationTreeSubtreeSnapshot<WhiteboardMindmapTreeValue> => ({
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

const readRequiredKey = (
  key: string | undefined,
  label: string
): string => {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(`${label} requires a non-empty key.`)
  }

  return key
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

export const whiteboardMutationRegistry = defineMutationRegistry<Document>()({
  entity: whiteboardEntities,
  ordered: {
    canvasOrder: {
      type: 'canvas.order',
      change: [{
        key: 'canvas.order',
        change: {
          order: true
        }
      }],
      read: (document: Document) => document.canvas.order,
      identify: canvasRefKey,
      clone: (ref: CanvasItemRef) => cloneCanvasRef(ref)!,
      write: (document: Document, _key, items: readonly CanvasItemRef[]) => ({
        ...document,
        canvas: {
          ...document.canvas,
          order: items.map((item) => cloneCanvasRef(item)!)
        }
      })
    },
    edgeLabels: {
      type: 'edge.labels',
      change: (key) => {
        const edgeId = readRequiredKey(key, 'edge.labels') as EdgeId
        return [{
          key: 'edge.labels',
          change: [edgeId]
        }]
      },
      read: (document: Document, key) => {
        const edgeId = readRequiredKey(key, 'edge.labels') as EdgeId
        const edge = document.edges[edgeId]
        if (!edge) {
          throw new Error(`Edge ${edgeId} not found.`)
        }
        return getLabels(edge)
      },
      identify: (label: EdgeLabel) => label.id,
      clone: (label: EdgeLabel) => clone(label)!,
      patch: applyEdgeLabelPatch,
      diff: diffEdgeLabelPatch,
      write: (document: Document, key, items: readonly EdgeLabel[]) => {
        const edgeId = readRequiredKey(key, 'edge.labels') as EdgeId
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
    },
    edgeRoute: {
      type: 'edge.route',
      change: (key) => {
        const edgeId = readRequiredKey(key, 'edge.route') as EdgeId
        return [{
          key: 'edge.route',
          change: [edgeId]
        }]
      },
      read: (document: Document, key) => {
        const edgeId = readRequiredKey(key, 'edge.route') as EdgeId
        const edge = document.edges[edgeId]
        if (!edge) {
          throw new Error(`Edge ${edgeId} not found.`)
        }
        return getManualRoutePoints(edge)
      },
      identify: (point: EdgeRoutePoint) => point.id,
      clone: (point: EdgeRoutePoint) => clone(point)!,
      write: (document: Document, key, items: readonly EdgeRoutePoint[]) => {
        const edgeId = readRequiredKey(key, 'edge.route') as EdgeId
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
  },
  tree: {
    mindmapTree: {
      type: 'mindmap.tree',
      change: (key) => {
        const mindmapId = readRequiredKey(key, 'mindmap.tree') as MindmapId
        return [{
          key: 'mindmap.structure',
          change: [mindmapId]
        }]
      },
      read: (document: Document, key) => {
        const mindmapId = readRequiredKey(key, 'mindmap.tree') as MindmapId
        const record = document.mindmaps[mindmapId]
        if (!record) {
          throw new Error(`Mindmap ${mindmapId} not found.`)
        }
        return createMindmapTreeSnapshot(record)
      },
      clone: (value: WhiteboardMindmapTreeValue) => clone(value)!,
      write: (document: Document, key, tree: MutationTreeSnapshot<WhiteboardMindmapTreeValue>) => (
        writeMindmapTreeSnapshot(
          document,
          readRequiredKey(key, 'mindmap.tree') as MindmapId,
          tree
        )
      )
    }
  }
})

export type WhiteboardMutationRegistry = typeof whiteboardMutationRegistry
