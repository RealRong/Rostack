import type {
  MutationSequenceAnchor,
  MutationTreeInsertInput,
  MutationTreeMoveInput,
  MutationWrite,
} from '@shared/mutation'
import {
  field,
  map,
  optional,
  schema,
  sequence,
  tree,
  type MutationDelta,
  type MutationQuery,
  type MutationReader,
} from '@shared/mutation'
import type {
  MindmapId,
  MindmapLayoutSpec,
  MindmapRecord,
  MindmapNodeId,
} from '@whiteboard/core/mindmap/types'
import type {
  Background,
  CanvasItemRef,
  Document,
  Edge,
  EdgeId,
  GroupId,
  Node,
  NodeId,
} from '@whiteboard/core/types'
import {
  canvasRefKey,
  type WhiteboardMindmapTreeValue,
} from './support'

const nodeShape = {
  type: field<Node['type']>(),
  position: field<Node['position']>(),
  size: field<Node['size']>(),
  rotation: optional(field<number>()),
  groupId: optional(field<GroupId>()),
  owner: optional(field<Node['owner']>()),
  locked: optional(field<boolean>()),
  data: optional(field<Node['data']>()),
  style: optional(field<Node['style']>()),
} as const

export type WhiteboardMutationNodeValue = Omit<Node, 'id'>

const edgeShape = {
  source: field<Edge['source']>(),
  target: field<Edge['target']>(),
  type: field<Edge['type']>(),
  locked: optional(field<boolean>()),
  groupId: optional(field<GroupId>()),
  textMode: optional(field<Edge['textMode']>()),
  style: optional(field<Edge['style']>()),
  data: optional(field<Edge['data']>()),
  labels: optional(field<Edge['labels']>()),
  points: optional(field<Edge['points']>()),
} as const

export type WhiteboardMutationEdgeValue = Omit<Edge, 'id'>

const groupShape = {
  locked: optional(field<boolean>()),
  name: optional(field<string>()),
} as const

export type WhiteboardMutationGroupValue = Omit<import('@whiteboard/core/types').Group, 'id'>

const mindmapShape = {
  layout: field<MindmapLayoutSpec>(),
  tree: tree<MindmapNodeId, WhiteboardMindmapTreeValue>(),
} as const

export type WhiteboardMutationMindmapValue = Omit<MindmapRecord, 'id'>

type ScopeIds<TId extends string> = ReadonlySet<TId> | 'all'

type TouchedIdsChange<TId extends string> = {
  touchedIds(): ScopeIds<TId>
}

type WhiteboardFlatChangeKey =
  | 'node.create'
  | 'node.delete'
  | 'node.geometry'
  | 'node.owner'
  | 'node.content'
  | 'edge.create'
  | 'edge.delete'
  | 'edge.endpoints'
  | 'edge.points'
  | 'edge.style'
  | 'edge.labels'
  | 'edge.data'
  | 'mindmap.create'
  | 'mindmap.delete'
  | 'mindmap.tree'
  | 'mindmap.layout'
  | 'group.create'
  | 'group.delete'
  | 'group.value'

const TARGET_ID_SCOPE_SEPARATOR = '\u001f'

const readTargetIdParts = (
  targetId?: string
): readonly string[] => targetId === undefined
  ? []
  : targetId.split(TARGET_ID_SCOPE_SEPARATOR)

const readRootTargetId = (
  targetId?: string
): string | undefined => readTargetIdParts(targetId)[0]

const pushTouchedId = <TId extends string>(
  target: Set<TId>,
  id?: string,
): void => {
  if (id) {
    target.add(id as TId)
  }
}

const createTouchedIdsChange = <TId extends string>(
  reset: boolean,
  ids: ReadonlySet<TId>,
): TouchedIdsChange<TId> => ({
  touchedIds: () => (
    reset
      ? 'all'
      : new Set(ids)
  )
})

const createFlatChange = <TId extends string>(
  reset: boolean,
  ids: ReadonlySet<TId>,
): {
  ids: readonly TId[]
  touchedIds(): ScopeIds<TId>
} => ({
  ids: reset
    ? []
    : [...ids],
  touchedIds: () => (
    reset
      ? 'all'
      : new Set(ids)
  )
})

export const whiteboardMutationSchema = schema({
  id: field<Document['id']>(),
  name: optional(field<string>()),
  background: optional(field<Background>()),
  order: sequence<CanvasItemRef>({
    keyOf: canvasRefKey
  }),
  nodes: map<NodeId, typeof nodeShape>(nodeShape),
  edges: map<EdgeId, typeof edgeShape>(edgeShape),
  groups: map<GroupId, typeof groupShape>(groupShape),
  mindmaps: map<MindmapId, typeof mindmapShape>(mindmapShape),
}).changes((delta) => {
  const writes = delta.writes()
  const reset = delta.reset()
  const shape = whiteboardMutationSchema.shape

  const nodeCreate = new Set<NodeId>()
  const nodeDelete = new Set<NodeId>()
  const nodeGeometry = new Set<NodeId>()
  const nodeOwner = new Set<NodeId>()
  const nodeContent = new Set<NodeId>()

  const edgeCreate = new Set<EdgeId>()
  const edgeDelete = new Set<EdgeId>()
  const edgeEndpoints = new Set<EdgeId>()
  const edgePoints = new Set<EdgeId>()
  const edgeStyle = new Set<EdgeId>()
  const edgeLabels = new Set<EdgeId>()
  const edgeData = new Set<EdgeId>()

  const mindmapCreate = new Set<MindmapId>()
  const mindmapDelete = new Set<MindmapId>()
  const mindmapStructure = new Set<MindmapId>()
  const mindmapLayout = new Set<MindmapId>()

  const groupCreate = new Set<GroupId>()
  const groupDelete = new Set<GroupId>()
  const groupValue = new Set<GroupId>()

  const touchNodeAll = (id?: string) => {
    pushTouchedId(nodeGeometry, id)
    pushTouchedId(nodeOwner, id)
    pushTouchedId(nodeContent, id)
  }

  const touchEdgeAll = (id?: string) => {
    pushTouchedId(edgeEndpoints, id)
    pushTouchedId(edgePoints, id)
    pushTouchedId(edgeStyle, id)
    pushTouchedId(edgeLabels, id)
    pushTouchedId(edgeData, id)
  }

  const touchMindmapAll = (id?: string) => {
    pushTouchedId(mindmapStructure, id)
    pushTouchedId(mindmapLayout, id)
  }

  const touchGroupAll = (id?: string) => {
    pushTouchedId(groupValue, id)
  }

  writes.forEach((write: MutationWrite) => {
    const rootId = readRootTargetId(write.targetId)

    if (write.kind === 'entity.create') {
      if (write.node === shape.nodes) {
        pushTouchedId(nodeCreate, rootId)
        return
      }
      if (write.node === shape.edges) {
        pushTouchedId(edgeCreate, rootId)
        return
      }
      if (write.node === shape.groups) {
        pushTouchedId(groupCreate, rootId)
        return
      }
      if (write.node === shape.mindmaps) {
        pushTouchedId(mindmapCreate, rootId)
        return
      }
    }

    if (write.kind === 'entity.remove') {
      if (write.node === shape.nodes) {
        pushTouchedId(nodeDelete, rootId)
        return
      }
      if (write.node === shape.edges) {
        pushTouchedId(edgeDelete, rootId)
        return
      }
      if (write.node === shape.groups) {
        pushTouchedId(groupDelete, rootId)
        return
      }
      if (write.node === shape.mindmaps) {
        pushTouchedId(mindmapDelete, rootId)
        return
      }
    }

    if (write.kind === 'entity.replace') {
      if (write.node === shape.nodes) {
        touchNodeAll(rootId)
        return
      }
      if (write.node === shape.edges) {
        touchEdgeAll(rootId)
        return
      }
      if (write.node === shape.groups) {
        touchGroupAll(rootId)
        return
      }
      if (write.node === shape.mindmaps) {
        touchMindmapAll(rootId)
        return
      }
    }

    if (write.node === shape.nodes.shape.position
      || write.node === shape.nodes.shape.size
      || write.node === shape.nodes.shape.rotation) {
      pushTouchedId(nodeGeometry, rootId)
      return
    }

    if (write.node === shape.nodes.shape.groupId
      || write.node === shape.nodes.shape.owner) {
      pushTouchedId(nodeOwner, rootId)
      return
    }

    if (write.node === shape.nodes.shape.type
      || write.node === shape.nodes.shape.locked
      || write.node === shape.nodes.shape.data
      || write.node === shape.nodes.shape.style) {
      pushTouchedId(nodeContent, rootId)
      return
    }

    if (write.node === shape.edges.shape.source
      || write.node === shape.edges.shape.target) {
      pushTouchedId(edgeEndpoints, rootId)
      return
    }

    if (write.node === shape.edges.shape.points) {
      pushTouchedId(edgePoints, rootId)
      return
    }

    if (write.node === shape.edges.shape.labels) {
      pushTouchedId(edgeLabels, rootId)
      return
    }

    if (write.node === shape.edges.shape.data) {
      pushTouchedId(edgeData, rootId)
      return
    }

    if (write.node === shape.edges.shape.type
      || write.node === shape.edges.shape.locked
      || write.node === shape.edges.shape.groupId
      || write.node === shape.edges.shape.textMode
      || write.node === shape.edges.shape.style) {
      pushTouchedId(edgeStyle, rootId)
      return
    }

      if (write.node === shape.mindmaps.shape.tree) {
        pushTouchedId(mindmapStructure, rootId)
        return
      }

      if (write.node === shape.mindmaps.shape.layout) {
        pushTouchedId(mindmapLayout, rootId)
        return
      }

    if (write.node === shape.groups.shape.locked
      || write.node === shape.groups.shape.name) {
      pushTouchedId(groupValue, rootId)
    }
  })

  const changes = {
    'node.create': createFlatChange(reset, nodeCreate),
    'node.delete': createFlatChange(reset, nodeDelete),
    'node.geometry': createFlatChange(reset, nodeGeometry),
    'node.owner': createFlatChange(reset, nodeOwner),
    'node.content': createFlatChange(reset, nodeContent),
    'edge.create': createFlatChange(reset, edgeCreate),
    'edge.delete': createFlatChange(reset, edgeDelete),
    'edge.endpoints': createFlatChange(reset, edgeEndpoints),
    'edge.points': createFlatChange(reset, edgePoints),
    'edge.style': createFlatChange(reset, edgeStyle),
    'edge.labels': createFlatChange(reset, edgeLabels),
    'edge.data': createFlatChange(reset, edgeData),
    'mindmap.create': createFlatChange(reset, mindmapCreate),
    'mindmap.delete': createFlatChange(reset, mindmapDelete),
    'mindmap.tree': createFlatChange(reset, mindmapStructure),
    'mindmap.layout': createFlatChange(reset, mindmapLayout),
    'group.create': createFlatChange(reset, groupCreate),
    'group.delete': createFlatChange(reset, groupDelete),
    'group.value': createFlatChange(reset, groupValue),
  } satisfies Record<WhiteboardFlatChangeKey, {
    ids: readonly string[]
    touchedIds(): ScopeIds<string>
  }>

  return {
    node: {
      create: createTouchedIdsChange(reset, nodeCreate),
      delete: createTouchedIdsChange(reset, nodeDelete),
      geometry: createTouchedIdsChange(reset, nodeGeometry),
      owner: createTouchedIdsChange(reset, nodeOwner),
      content: createTouchedIdsChange(reset, nodeContent),
    },
    edge: {
      create: createTouchedIdsChange(reset, edgeCreate),
      delete: createTouchedIdsChange(reset, edgeDelete),
      endpoints: createTouchedIdsChange(reset, edgeEndpoints),
      points: createTouchedIdsChange(reset, edgePoints),
      style: createTouchedIdsChange(reset, edgeStyle),
      labels: createTouchedIdsChange(reset, edgeLabels),
      data: createTouchedIdsChange(reset, edgeData),
    },
    mindmap: {
      create: createTouchedIdsChange(reset, mindmapCreate),
      delete: createTouchedIdsChange(reset, mindmapDelete),
      structure: createTouchedIdsChange(reset, mindmapStructure),
      layout: createTouchedIdsChange(reset, mindmapLayout),
    },
    group: {
      create: createTouchedIdsChange(reset, groupCreate),
      delete: createTouchedIdsChange(reset, groupDelete),
      value: createTouchedIdsChange(reset, groupValue),
    },
    changes,
  }
})

export type WhiteboardMutationSchema = typeof whiteboardMutationSchema
export type WhiteboardMutationReaderBase = MutationReader<WhiteboardMutationSchema>
export type WhiteboardMutationWriterBase = {
  id: { set(value: Document['id']): void }
  name: { set(value: Document['name']): void }
  background: { set(value: Document['background']): void }
  order: {
    insert(value: CanvasItemRef, anchor?: MutationSequenceAnchor): void
    move(value: CanvasItemRef, anchor?: MutationSequenceAnchor): void
    remove(value: CanvasItemRef): void
    replace(value: readonly CanvasItemRef[]): void
  }
  nodes: ((id: NodeId) => {
    patch(value: Partial<Node>): void
  }) & {
    create(id: NodeId, value: WhiteboardMutationNodeValue): void
    replace(id: NodeId, value: WhiteboardMutationNodeValue): void
    remove(id: NodeId): void
  }
  edges: ((id: EdgeId) => {
    patch(value: Partial<Edge>): void
  }) & {
    create(id: EdgeId, value: WhiteboardMutationEdgeValue): void
    replace(id: EdgeId, value: WhiteboardMutationEdgeValue): void
    remove(id: EdgeId): void
  }
  groups: ((id: GroupId) => {
    patch(value: Partial<Pick<import('@whiteboard/core/types').Group, 'locked' | 'name'>>): void
  }) & {
    create(id: GroupId, value: WhiteboardMutationGroupValue): void
    replace(id: GroupId, value: WhiteboardMutationGroupValue): void
    remove(id: GroupId): void
  }
  mindmaps: ((id: MindmapId) => {
    layout: { set(value: MindmapLayoutSpec): void }
    tree: {
      insert(nodeId: string, value: MutationTreeInsertInput<WhiteboardMindmapTreeValue>): void
      move(nodeId: string, value: MutationTreeMoveInput): void
      patch(nodeId: string, value: Record<string, unknown>): void
      remove(nodeId: string): void
    }
  }) & {
    create(id: MindmapId, value: WhiteboardMutationMindmapValue): void
    replace(id: MindmapId, value: WhiteboardMutationMindmapValue): void
    remove(id: MindmapId): void
  }
}
export type WhiteboardMutationQueryBase = MutationQuery<WhiteboardMutationSchema>
export type WhiteboardMutationDelta = MutationDelta<WhiteboardMutationSchema>
export type { MutationSequenceAnchor }
