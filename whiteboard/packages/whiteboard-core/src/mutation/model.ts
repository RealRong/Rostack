import type {
  MutationSequenceAnchor,
  MutationWrite,
  MutationTreeSnapshot,
} from '@shared/mutation'
import {
  field,
  map,
  schema,
  sequence,
  table,
  tree,
  type MutationDelta,
  type MutationQuery,
  type MutationReader,
  type MutationWriter,
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
  EdgeLabel,
  EdgeRoutePoint,
  Group,
  GroupId,
  Node,
  NodeId,
} from '@whiteboard/core/types'
import {
  canvasRefKey,
  createMindmapTreeSnapshot,
  getLabels,
  getManualRoutePoints,
  type WhiteboardMindmapTreeValue,
  writeEdgeLabels,
  writeEdgeRoute,
  writeMindmapTreeSnapshot,
} from './support'

type TableValue<T extends {
  id: string
}> = {
  ids: readonly string[]
  byId: Readonly<Partial<Record<string, T>>>
}

type MutationEdgeLabel = {
  id: string
  text: EdgeLabel['text']
  t: EdgeLabel['t']
  offset: EdgeLabel['offset']
  style: EdgeLabel['style']
  data: EdgeLabel['data']
}

type MutationEdgeRoutePoint = {
  id: string
  x: EdgeRoutePoint['x']
  y: EdgeRoutePoint['y']
}

const toLabelTableValue = (
  items: readonly EdgeLabel[]
): TableValue<MutationEdgeLabel> => ({
  ids: items.map((item) => item.id),
  byId: Object.fromEntries(
    items.map((item) => [item.id, {
      id: item.id,
      text: structuredClone(item.text),
      t: structuredClone(item.t),
      offset: structuredClone(item.offset),
      style: structuredClone(item.style),
      data: structuredClone(item.data)
    } satisfies MutationEdgeLabel])
  )
})

const fromLabelTableValue = (
  value: TableValue<MutationEdgeLabel> | undefined
): readonly EdgeLabel[] => {
  const source = value
  return (source?.ids ?? []).flatMap((id) => {
    const item = source?.byId[id]
    return item
      ? [structuredClone(item)]
      : []
  })
}

const toRouteTableValue = (
  items: readonly EdgeRoutePoint[]
): TableValue<MutationEdgeRoutePoint> => ({
  ids: items.map((item) => item.id),
  byId: Object.fromEntries(
    items.map((item) => [item.id, {
      id: item.id,
      x: item.x,
      y: item.y
    } satisfies MutationEdgeRoutePoint])
  )
})

const fromRouteTableValue = (
  value: TableValue<MutationEdgeRoutePoint> | undefined
): readonly EdgeRoutePoint[] => {
  const source = value
  return (source?.ids ?? []).flatMap((id) => {
    const item = source?.byId[id]
    return item
      ? [structuredClone(item)]
      : []
  })
}

const nodeShape = {
  type: field<Node['type']>(),
  position: field<Node['position']>(),
  size: field<Node['size']>(),
  rotation: field<number>().optional(),
  groupId: field<GroupId>().optional(),
  owner: field<Node['owner']>().optional(),
  locked: field<boolean>().optional(),
  data: field<Node['data']>().optional(),
  style: field<Node['style']>().optional(),
} as const

const edgeLabelShape = {
  text: field<string>().optional(),
  t: field<number>().optional(),
  offset: field<number>().optional(),
  style: field<EdgeLabel['style']>().optional(),
  data: field<EdgeLabel['data']>().optional(),
} as const

const edgeRoutePointShape = {
  x: field<EdgeRoutePoint['x']>(),
  y: field<EdgeRoutePoint['y']>(),
} as const

const edgeShape = {
  source: field<Edge['source']>(),
  target: field<Edge['target']>(),
  type: field<Edge['type']>(),
  locked: field<boolean>().optional(),
  groupId: field<GroupId>().optional(),
  textMode: field<Edge['textMode']>().optional(),
  style: field<Edge['style']>().optional(),
  data: field<Edge['data']>().optional(),
  labels: table<string, typeof edgeLabelShape>(edgeLabelShape).from({
    read(document, targetId) {
      const edge = (document as Document).edges[targetId as EdgeId]
      return toLabelTableValue(getLabels(edge ?? ({ id: targetId } as Edge)))
    },
    write(document, value, targetId) {
      return writeEdgeLabels(
        document as Document,
        targetId as EdgeId,
        fromLabelTableValue(value as TableValue<MutationEdgeLabel>)
      )
    }
  }),
  route: table<string, typeof edgeRoutePointShape>(edgeRoutePointShape).from({
    read(document, targetId) {
      const edge = (document as Document).edges[targetId as EdgeId]
      return toRouteTableValue(getManualRoutePoints(edge ?? ({ id: targetId } as Edge)))
    },
    write(document, value, targetId) {
      return writeEdgeRoute(
        document as Document,
        targetId as EdgeId,
        fromRouteTableValue(value as TableValue<MutationEdgeRoutePoint>)
      )
    }
  }),
} as const

const groupShape = {
  locked: field<boolean>().optional(),
  name: field<string>().optional(),
} as const

const mindmapShape = {
  root: field<MindmapRecord['root']>(),
  layout: field<MindmapLayoutSpec>(),
  structure: tree<MindmapNodeId, WhiteboardMindmapTreeValue>().from({
    read(document, targetId) {
      const record = (document as Document).mindmaps[targetId as MindmapId]
      if (!record) {
        return {
          rootIds: [],
          nodes: {}
        } satisfies MutationTreeSnapshot<WhiteboardMindmapTreeValue>
      }
      return createMindmapTreeSnapshot(record)
    },
    write(document, value, targetId) {
      return writeMindmapTreeSnapshot(
        document as Document,
        targetId as MindmapId,
        value as MutationTreeSnapshot<WhiteboardMindmapTreeValue>
      )
    }
  }),
} as const

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
  | 'edge.route'
  | 'edge.style'
  | 'edge.labels'
  | 'edge.data'
  | 'mindmap.create'
  | 'mindmap.delete'
  | 'mindmap.structure'
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
  name: field<string>().optional(),
  background: field<Background>().optional(),
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
  const edgeRoute = new Set<EdgeId>()
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
    pushTouchedId(edgeRoute, id)
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
      if (write.node === shape.edges.shape.labels) {
        pushTouchedId(edgeLabels, rootId)
        return
      }
      if (write.node === shape.edges.shape.route) {
        pushTouchedId(edgeRoute, rootId)
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
      if (write.node === shape.edges.shape.labels) {
        pushTouchedId(edgeLabels, rootId)
        return
      }
      if (write.node === shape.edges.shape.route) {
        pushTouchedId(edgeRoute, rootId)
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

    if (write.node === shape.edges.shape.route
      || write.node === shape.edges.shape.route.shape.x
      || write.node === shape.edges.shape.route.shape.y) {
      pushTouchedId(edgeRoute, rootId)
      return
    }

    if (write.node === shape.edges.shape.labels
      || write.node === shape.edges.shape.labels.shape.text
      || write.node === shape.edges.shape.labels.shape.t
      || write.node === shape.edges.shape.labels.shape.offset
      || write.node === shape.edges.shape.labels.shape.style
      || write.node === shape.edges.shape.labels.shape.data) {
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

    if (write.node === shape.mindmaps.shape.root
      || write.node === shape.mindmaps.shape.structure) {
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
    'edge.route': createFlatChange(reset, edgeRoute),
    'edge.style': createFlatChange(reset, edgeStyle),
    'edge.labels': createFlatChange(reset, edgeLabels),
    'edge.data': createFlatChange(reset, edgeData),
    'mindmap.create': createFlatChange(reset, mindmapCreate),
    'mindmap.delete': createFlatChange(reset, mindmapDelete),
    'mindmap.structure': createFlatChange(reset, mindmapStructure),
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
      route: createTouchedIdsChange(reset, edgeRoute),
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
export type WhiteboardMutationWriterBase = MutationWriter<WhiteboardMutationSchema>
export type WhiteboardMutationQueryBase = MutationQuery<WhiteboardMutationSchema>
export type WhiteboardMutationDelta = MutationDelta<WhiteboardMutationSchema>
export type { MutationSequenceAnchor }
