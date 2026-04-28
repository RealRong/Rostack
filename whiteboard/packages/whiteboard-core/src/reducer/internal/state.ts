import { json } from '@shared/core'
import {
  draft,
  type DraftList,
  type DraftRecord,
  type DraftRoot
} from '@shared/draft'
import { idDelta } from '@shared/delta'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  Background,
  CanvasItemRef,
  ChangeSet,
  Document,
  Edge,
  EdgeAnchor,
  EdgeId,
  EdgeLabelStyle,
  EdgeRoute,
  Group,
  GroupId,
  Invalidation,
  MindmapId,
  MindmapLayoutSpec,
  MindmapMemberRecord,
  MindmapRecord,
  Node,
  NodeId,
  Operation,
  Point,
  Size
} from '@whiteboard/core/types'

export type DraftDocument = {
  root: DraftRoot<Document>
  background: Document['background']
  backgroundChanged: boolean
  canvasOrder: DraftList<CanvasItemRef>
  nodes: DraftRecord<NodeId, Node>
  edges: DraftRecord<EdgeId, Edge>
  groups: DraftRecord<GroupId, Group>
  mindmaps: DraftRecord<MindmapId, MindmapRecord>
}

export interface WhiteboardInverse<TOp> {
  prepend(op: TOp): void
  prependMany(ops: readonly TOp[]): void
}

export type WhiteboardReduceState = {
  draft: DraftDocument
  inverse: WhiteboardInverse<Operation>
  changes: ChangeSet
  invalidation: Invalidation
  replaced: boolean
  queue: {
    mindmapLayout: MindmapId[]
    mindmapLayoutSet: Set<MindmapId>
  }
}

export const createChangeSet = (): ChangeSet => ({
  document: false,
  background: false,
  canvasOrder: false,
  nodes: idDelta.create<NodeId>(),
  edges: idDelta.create<EdgeId>(),
  groups: idDelta.create<GroupId>(),
  mindmaps: idDelta.create<MindmapId>()
})

export const createInvalidation = (): Invalidation => ({
  document: false,
  background: false,
  canvasOrder: false,
  nodes: new Set<NodeId>(),
  edges: new Set<EdgeId>(),
  groups: new Set<GroupId>(),
  mindmaps: new Set<MindmapId>()
})

export const createDraftDocument = (
  document: Document
): DraftDocument => ({
  root: draft.root(document),
  background: document.background,
  backgroundChanged: false,
  canvasOrder: draft.list(document.canvas.order),
  nodes: draft.table(document.nodes),
  edges: draft.table(document.edges),
  groups: draft.table(document.groups),
  mindmaps: draft.table(document.mindmaps)
})

export const materializeDraftDocument = (
  draft: DraftDocument
): Document => {
  if (
    !draft.root.changed()
    && !draft.backgroundChanged
    && !draft.canvasOrder.changed()
    && !draft.nodes.changed()
    && !draft.edges.changed()
    && !draft.groups.changed()
    && !draft.mindmaps.changed()
  ) {
    return draft.root.finish()
  }

  const next = draft.root.write()
  if (draft.backgroundChanged) {
    next.background = draft.background
  }
  if (draft.canvasOrder.changed()) {
    next.canvas = {
      ...next.canvas,
      order: draft.canvasOrder.finish() as CanvasItemRef[]
    }
  }
  if (draft.nodes.changed()) {
    next.nodes = draft.nodes.finish()
  }
  if (draft.edges.changed()) {
    next.edges = draft.edges.finish()
  }
  if (draft.groups.changed()) {
    next.groups = draft.groups.finish()
  }
  if (draft.mindmaps.changed()) {
    next.mindmaps = draft.mindmaps.finish()
  }

  return draft.root.finish()
}

export const clonePoint = (
  point: Point | undefined
): Point | undefined => (
  point
    ? {
        x: point.x,
        y: point.y
      }
    : undefined
)

export const cloneSize = (
  size: Size
): Size => ({
  width: size.width,
  height: size.height
})

export const cloneBackground = (
  background: Background | undefined
): Background | undefined => (
  background
    ? {
        type: background.type,
        color: background.color
      }
    : undefined
)

export const cloneCanvasRef = (
  ref: CanvasItemRef | undefined
): CanvasItemRef | undefined => (
  ref
    ? {
        kind: ref.kind,
        id: ref.id
      }
    : undefined
)

export const cloneCanvasSlot = (
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

export const cloneNodeOwner = (
  owner: Node['owner']
) => (
  owner
    ? {
        kind: owner.kind,
        id: owner.id
      }
    : undefined
)

export const cloneEdgeAnchor = (
  anchor: EdgeAnchor | undefined
): EdgeAnchor | undefined => (
  anchor
    ? {
        side: anchor.side,
        offset: anchor.offset
      }
    : undefined
)

export const cloneEdgeEnd = (
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

export const cloneEdgeRoute = (
  route: EdgeRoute | undefined
): EdgeRoute | undefined => (
  route?.kind === 'manual'
    ? {
        kind: 'manual',
        points: route.points.map((point) => ({
          id: point.id,
          x: point.x,
          y: point.y
        }))
      }
    : route
      ? {
          kind: 'auto'
        }
      : undefined
)

export const cloneEdgeStyle = (
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

export const cloneEdgeLabelStyle = (
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

export const cloneEdgeLabels = (
  labels: Edge['labels']
) => labels?.map((label) => ({
  id: label.id,
  text: label.text,
  t: label.t,
  offset: label.offset,
  style: cloneEdgeLabelStyle(label.style),
  data: json.clone(label.data)
}))

export const cloneNode = (
  node: Node
): Node => ({
  id: node.id,
  type: node.type,
  position: clonePoint(node.position)!,
  size: cloneSize(node.size),
  rotation: node.rotation,
  groupId: node.groupId,
  owner: cloneNodeOwner(node.owner),
  locked: node.locked,
  data: json.clone(node.data),
  style: json.clone(node.style)
})

export const cloneEdge = (
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
  data: json.clone(edge.data)
})

export const cloneGroup = (
  group: Group
): Group => ({
  id: group.id,
  locked: group.locked,
  name: group.name
})

export const cloneBranchStyle = (
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

export const cloneMindmapMember = (
  member: MindmapRecord['members'][string] | undefined
) => (
  member
    ? {
        parentId: member.parentId,
        side: member.side,
        collapsed: member.collapsed,
        branchStyle: cloneBranchStyle(member.branchStyle)
      }
    : undefined
)

export const cloneMindmapLayout = (
  layout: MindmapLayoutSpec
): MindmapLayoutSpec => ({
  side: layout.side,
  mode: layout.mode,
  hGap: layout.hGap,
  vGap: layout.vGap
})

export const cloneLayoutPatch = (
  layout: Partial<MindmapLayoutSpec> | undefined
): Partial<MindmapLayoutSpec> | undefined => (
  layout
    ? {
        ...layout
      }
    : undefined
)

export const cloneMindmap = (
  mindmap: MindmapRecord
): MindmapRecord => ({
  id: mindmap.id,
  root: mindmap.root,
  members: Object.fromEntries(
    Object.entries(mindmap.members).map(([nodeId, member]) => [
      nodeId,
      cloneMindmapMember(member)!
    ])
  ) as Record<string, MindmapMemberRecord>,
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

export const getNode = (
  draft: DraftDocument,
  id: NodeId
): Node | undefined => draft.nodes.get(id)

export const getEdge = (
  draft: DraftDocument,
  id: EdgeId
): Edge | undefined => draft.edges.get(id)

export const getGroup = (
  draft: DraftDocument,
  id: GroupId
): Group | undefined => draft.groups.get(id)

export const getMindmap = (
  draft: DraftDocument,
  id: MindmapId
): MindmapRecord | undefined => draft.mindmaps.get(id)

export const getMindmapTree = (
  draft: DraftDocument,
  id: MindmapId | NodeId
) => {
  const direct = getMindmap(draft, id as MindmapId)
  if (direct) {
    return mindmapApi.tree.fromRecord(direct)
  }

  const node = getNode(draft, id as NodeId)
  const mindmapId = node?.owner?.kind === 'mindmap'
    ? node.owner.id
    : undefined
  const record = mindmapId
    ? getMindmap(draft, mindmapId)
    : undefined
  return record
    ? mindmapApi.tree.fromRecord(record)
    : undefined
}

export const captureNode = (
  state: WhiteboardReduceState,
  id: NodeId
): Node => {
  const node = getNode(state.draft, id)
  if (!node) {
    throw new Error(`Node ${id} not found.`)
  }
  return cloneNode(node)
}

export const captureEdge = (
  state: WhiteboardReduceState,
  id: EdgeId
): Edge => {
  const edge = getEdge(state.draft, id)
  if (!edge) {
    throw new Error(`Edge ${id} not found.`)
  }
  return cloneEdge(edge)
}

export const captureGroup = (
  state: WhiteboardReduceState,
  id: GroupId
): Group => {
  const group = getGroup(state.draft, id)
  if (!group) {
    throw new Error(`Group ${id} not found.`)
  }
  return cloneGroup(group)
}

export const isTopLevelNode = (
  node: Node | undefined
): boolean => Boolean(node && !node.owner)

export const collectConnectedEdges = (
  draft: DraftDocument,
  nodeIds: ReadonlySet<NodeId>
): readonly Edge[] => [...draft.edges.values()].filter((edge) => (
  (edge.source.kind === 'node' && nodeIds.has(edge.source.nodeId))
  || (edge.target.kind === 'node' && nodeIds.has(edge.target.nodeId))
))

export const markDocumentTouched = (
  state: WhiteboardReduceState
): void => {
  state.changes.document = true
  state.invalidation.document = true
}

export const markBackgroundTouched = (
  state: WhiteboardReduceState
): void => {
  state.changes.document = true
  state.changes.background = true
  state.invalidation.document = true
  state.invalidation.background = true
}

export const markCanvasOrderTouched = (
  state: WhiteboardReduceState
): void => {
  state.changes.canvasOrder = true
  state.invalidation.canvasOrder = true
}

export const markNodeAdded = (
  state: WhiteboardReduceState,
  id: NodeId
): void => {
  idDelta.add(state.changes.nodes, id)
  state.invalidation.nodes.add(id)
}

export const markNodeUpdated = (
  state: WhiteboardReduceState,
  id: NodeId
): void => {
  idDelta.update(state.changes.nodes, id)
  state.invalidation.nodes.add(id)
}

export const markNodeRemoved = (
  state: WhiteboardReduceState,
  id: NodeId
): void => {
  idDelta.remove(state.changes.nodes, id)
  state.invalidation.nodes.add(id)
}

export const markEdgeAdded = (
  state: WhiteboardReduceState,
  id: EdgeId
): void => {
  idDelta.add(state.changes.edges, id)
  state.invalidation.edges.add(id)
}

export const markEdgeUpdated = (
  state: WhiteboardReduceState,
  id: EdgeId
): void => {
  idDelta.update(state.changes.edges, id)
  state.invalidation.edges.add(id)
}

export const markEdgeRemoved = (
  state: WhiteboardReduceState,
  id: EdgeId
): void => {
  idDelta.remove(state.changes.edges, id)
  state.invalidation.edges.add(id)
}

export const markGroupAdded = (
  state: WhiteboardReduceState,
  id: GroupId
): void => {
  idDelta.add(state.changes.groups, id)
  state.invalidation.groups.add(id)
}

export const markGroupUpdated = (
  state: WhiteboardReduceState,
  id: GroupId
): void => {
  idDelta.update(state.changes.groups, id)
  state.invalidation.groups.add(id)
}

export const markGroupRemoved = (
  state: WhiteboardReduceState,
  id: GroupId
): void => {
  idDelta.remove(state.changes.groups, id)
  state.invalidation.groups.add(id)
}

export const markMindmapAdded = (
  state: WhiteboardReduceState,
  id: MindmapId
): void => {
  idDelta.add(state.changes.mindmaps, id)
  state.invalidation.mindmaps.add(id)
}

export const markMindmapUpdated = (
  state: WhiteboardReduceState,
  id: MindmapId
): void => {
  idDelta.update(state.changes.mindmaps, id)
  state.invalidation.mindmaps.add(id)
}

export const markMindmapRemoved = (
  state: WhiteboardReduceState,
  id: MindmapId
): void => {
  idDelta.remove(state.changes.mindmaps, id)
  state.invalidation.mindmaps.add(id)
}

export const touchMindmap = (
  state: WhiteboardReduceState,
  id: MindmapId
): void => {
  state.invalidation.mindmaps.add(id)
}

export const enqueueMindmapLayout = (
  state: WhiteboardReduceState,
  id: MindmapId
): void => {
  touchMindmap(state, id)
  if (state.queue.mindmapLayoutSet.has(id)) {
    return
  }

  state.queue.mindmapLayoutSet.add(id)
  state.queue.mindmapLayout.push(id)
}
