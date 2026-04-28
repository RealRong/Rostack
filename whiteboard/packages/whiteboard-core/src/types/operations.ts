import type { IdDelta as SharedIdDelta } from '@shared/delta'
import type { RecordWrite } from '@shared/draft'
import type {
  Background,
  CanvasItemRef,
  Document,
  Edge,
  EdgeEnd,
  EdgeId,
  EdgeLabel,
  EdgeRoutePoint,
  EdgeStyle,
  EdgeTextMode,
  EdgeType,
  Group,
  GroupId,
  Node,
  NodeData,
  NodeId,
  NodeOwner,
  NodeStyle,
  Point,
  SpatialNode,
  Size
} from '@whiteboard/core/types/model'
import type {
  MindmapBranchLineKind,
  MindmapId,
  MindmapLayoutSpec,
  MindmapRecord,
  MindmapStrokeStyle,
  MindmapTopicCloneInput,
  MindmapTopicDeleteInput,
  MindmapTopicInsertInput,
  MindmapTopicMoveInput
} from '@whiteboard/core/mindmap/types'

export type SpatialNodeInput = Omit<SpatialNode, 'id'> & {
  id?: NodeId
}

export type NodeInput = SpatialNodeInput

export type EdgeRouteInput =
  | {
      kind: 'auto'
    }
  | {
      kind: 'manual'
      points: Point[]
    }

export type EdgeInput = Omit<Edge, 'id' | 'route'> & {
  id?: EdgeId
  route?: EdgeRouteInput
}

export type NodeFieldPatch = {
  position?: Point
  size?: Size
  rotation?: number
  groupId?: GroupId
  owner?: NodeOwner
  locked?: boolean
}

export type NodePatch = NodeFieldPatch & {
  data?: NodeData
  style?: NodeStyle
}

export type NodeField =
  | 'position'
  | 'size'
  | 'rotation'
  | 'groupId'
  | 'owner'
  | 'locked'

export type NodeUnsetField = Exclude<NodeField, 'position'>

export type NodeUpdateInput = {
  fields?: NodeFieldPatch
  record?: RecordWrite
}

export type EdgePatch = Partial<{
  source: EdgeEnd
  target: EdgeEnd
  type: EdgeType
  locked: boolean
  groupId: GroupId
  route: EdgeRouteInput
  style: EdgeStyle
  textMode: EdgeTextMode
  labels: readonly EdgeLabel[]
  data: Record<string, unknown>
}>

export type EdgeFieldPatch = {
  source?: EdgeEnd
  target?: EdgeEnd
  type?: EdgeType
  locked?: boolean
  groupId?: GroupId
  textMode?: EdgeTextMode
}

export type EdgeField =
  | 'source'
  | 'target'
  | 'type'
  | 'locked'
  | 'groupId'
  | 'textMode'

export type EdgeUnsetField = Exclude<EdgeField, 'source' | 'target' | 'type'>

export type EdgeUpdateInput = {
  fields?: EdgeFieldPatch
  record?: RecordWrite
}

export type GroupPatch = Partial<Omit<Group, 'id'>>
export type GroupField = 'locked' | 'name'

export type DocumentPatch = {
  background?: Document['background']
}

export type EdgeLabelField = 'text' | 't' | 'offset'
export type EdgeLabelRecordScope = 'data' | 'style'
export type EdgeLabelFieldPatch = {
  text?: string
  t?: number
  offset?: number
}

export type EdgeLabelUpdateInput = {
  fields?: EdgeLabelFieldPatch
  record?: RecordWrite
}

export type EdgeRoutePointField = 'x' | 'y'

export type CanvasOrderAnchor =
  | { kind: 'front' }
  | { kind: 'back' }
  | { kind: 'before'; ref: CanvasItemRef }
  | { kind: 'after'; ref: CanvasItemRef }

export type EdgeLabelAnchor =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; labelId: string }
  | { kind: 'after'; labelId: string }

export type EdgeRoutePointAnchor =
  | { kind: 'start' }
  | { kind: 'end' }
  | { kind: 'before'; pointId: string }
  | { kind: 'after'; pointId: string }

export type MindmapTopicField =
  | 'size'
  | 'rotation'
  | 'locked'

export type MindmapTopicUnsetField = Exclude<MindmapTopicField, 'size'>
export type MindmapTopicFieldPatch = {
  size?: Size
  rotation?: number
  locked?: boolean
}
export type MindmapBranchField =
  | 'color'
  | 'line'
  | 'width'
  | 'stroke'

export type Origin = 'user' | 'remote' | 'system'

export type CanvasSlot = {
  prev?: CanvasItemRef
  next?: CanvasItemRef
}

export type TopicSlot = {
  parent: NodeId
  prev?: NodeId
  next?: NodeId
}

export type MindmapSnapshot = {
  mindmap: MindmapRecord
  nodes: Node[]
  slot?: CanvasSlot
}

export type MindmapTopicSnapshot = {
  root: NodeId
  slot: TopicSlot
  nodes: Node[]
  members: Record<NodeId, MindmapRecord['members'][NodeId]>
  children: Record<NodeId, NodeId[]>
}

export type MindmapTopicUpdateInput = {
  fields?: MindmapTopicFieldPatch
  record?: RecordWrite
}

export type MindmapBranchFieldPatch = {
  color?: string
  line?: MindmapBranchLineKind
  width?: number
  stroke?: MindmapStrokeStyle
}

export type MindmapBranchUpdateInput = {
  fields?: MindmapBranchFieldPatch
}

export type Op =
  | { readonly type: 'document.replace'; readonly document: Document }
  | { readonly type: 'document.background'; readonly background?: Background }
  | { readonly type: 'canvas.order.move'; readonly refs: readonly CanvasItemRef[]; readonly to: CanvasOrderAnchor }
  | { readonly type: 'node.create'; readonly node: Node }
  | { readonly type: 'node.restore'; readonly node: Node; readonly slot?: CanvasSlot }
  | { readonly type: 'node.patch'; readonly id: NodeId; readonly fields?: NodeFieldPatch; readonly record?: RecordWrite }
  | { readonly type: 'node.delete'; readonly id: NodeId }
  | { readonly type: 'edge.create'; readonly edge: Edge }
  | { readonly type: 'edge.restore'; readonly edge: Edge; readonly slot?: CanvasSlot }
  | { readonly type: 'edge.patch'; readonly id: EdgeId; readonly fields?: EdgeFieldPatch; readonly record?: RecordWrite }
  | { readonly type: 'edge.label.insert'; readonly edgeId: EdgeId; readonly label: EdgeLabel; readonly to: EdgeLabelAnchor }
  | { readonly type: 'edge.label.delete'; readonly edgeId: EdgeId; readonly labelId: string }
  | { readonly type: 'edge.label.move'; readonly edgeId: EdgeId; readonly labelId: string; readonly to: EdgeLabelAnchor }
  | { readonly type: 'edge.label.patch'; readonly edgeId: EdgeId; readonly labelId: string; readonly fields?: EdgeLabelFieldPatch; readonly record?: RecordWrite }
  | { readonly type: 'edge.route.point.insert'; readonly edgeId: EdgeId; readonly point: EdgeRoutePoint; readonly to: EdgeRoutePointAnchor }
  | { readonly type: 'edge.route.point.delete'; readonly edgeId: EdgeId; readonly pointId: string }
  | { readonly type: 'edge.route.point.move'; readonly edgeId: EdgeId; readonly pointId: string; readonly to: EdgeRoutePointAnchor }
  | { readonly type: 'edge.route.point.patch'; readonly edgeId: EdgeId; readonly pointId: string; readonly fields: Partial<Record<EdgeRoutePointField, number>> }
  | { readonly type: 'edge.delete'; readonly id: EdgeId }
  | { readonly type: 'group.create'; readonly group: Group }
  | { readonly type: 'group.restore'; readonly group: Group }
  | { readonly type: 'group.patch'; readonly id: GroupId; readonly fields?: Partial<Record<GroupField, Group[GroupField] | undefined>> }
  | { readonly type: 'group.delete'; readonly id: GroupId }
  | { readonly type: 'mindmap.create'; readonly mindmap: MindmapRecord; readonly nodes: Node[] }
  | { readonly type: 'mindmap.restore'; readonly snapshot: MindmapSnapshot }
  | { readonly type: 'mindmap.delete'; readonly id: string }
  | { readonly type: 'mindmap.move'; readonly id: string; readonly position: Point }
  | { readonly type: 'mindmap.layout'; readonly id: string; readonly patch: Partial<MindmapLayoutSpec> }
  | { readonly type: 'mindmap.topic.insert'; readonly id: string; readonly input: MindmapTopicInsertInput; readonly node: Node }
  | { readonly type: 'mindmap.topic.restore'; readonly id: string; readonly snapshot: MindmapTopicSnapshot }
  | { readonly type: 'mindmap.topic.move'; readonly id: string; readonly input: MindmapTopicMoveInput }
  | { readonly type: 'mindmap.topic.delete'; readonly id: string; readonly input: MindmapTopicDeleteInput }
  | { readonly type: 'mindmap.topic.patch'; readonly id: string; readonly topicId: NodeId; readonly fields?: MindmapTopicFieldPatch; readonly record?: RecordWrite }
  | { readonly type: 'mindmap.branch.patch'; readonly id: string; readonly topicId: NodeId; readonly fields?: MindmapBranchFieldPatch }
  | { readonly type: 'mindmap.topic.collapse'; readonly id: string; readonly topicId: NodeId; readonly collapsed?: boolean }

export type Operation = Op

export type Batch = {
  ops: readonly Op[]
  output?: unknown
}

export type ChangeSet = {
  document: boolean
  background: boolean
  canvasOrder: boolean
  nodes: SharedIdDelta<NodeId>
  edges: SharedIdDelta<EdgeId>
  groups: SharedIdDelta<GroupId>
  mindmaps: SharedIdDelta<MindmapId>
}

export type Invalidation = {
  document: boolean
  background: boolean
  canvasOrder: boolean
  nodes: Set<NodeId>
  edges: Set<EdgeId>
  groups: Set<GroupId>
  mindmaps: Set<MindmapId>
}
