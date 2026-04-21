import { json } from '@shared/core'
import type {
  CanvasItemRef,
  Document,
  Edge,
  EdgeAnchor,
  EdgeLabelStyle,
  Group,
  MindmapLayoutSpec,
  MindmapRecord,
  Node
} from '@whiteboard/core/types'

export const clonePoint = (
  point: { x: number; y: number } | undefined
) => (
  point
    ? {
        x: point.x,
        y: point.y
      }
    : undefined
)

export const cloneSize = (
  size: { width: number; height: number } | undefined
) => (
  size
    ? {
        width: size.width,
        height: size.height
      }
    : undefined
)

export const cloneBackground = (
  background: Document['background']
) => (
  background
    ? {
        type: background.type,
        color: background.color
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

export const cloneCanvasRef = (
  ref: CanvasItemRef | undefined
) => (
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

export const cloneEdgeAnchor = (
  anchor: EdgeAnchor | undefined
) => (
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

export const cloneMindmapMember = (
  member: MindmapRecord['members'][string] | undefined
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

export const cloneMindmapLayout = (
  layout: MindmapLayoutSpec
): MindmapLayoutSpec => ({
  side: layout.side,
  mode: layout.mode,
  hGap: layout.hGap,
  vGap: layout.vGap
})

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

export const cloneLayoutPatch = (
  layout: Partial<MindmapLayoutSpec> | undefined
) => (
  layout
    ? {
        ...layout
      }
    : undefined
)
