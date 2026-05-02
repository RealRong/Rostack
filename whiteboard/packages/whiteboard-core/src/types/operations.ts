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

export type DocumentPatch = Partial<Pick<Document, 'id' | 'name' | 'background' | 'order'>>

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

export type EdgeLabelPatch = EdgeLabelFieldPatch & {
  data?: Record<string, unknown>
  style?: EdgeLabel['style']
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

export type MindmapTopicPatch = MindmapTopicFieldPatch & {
  data?: NodeData
  style?: NodeStyle
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
  | { readonly type: 'document.create'; readonly value: Document }
  | { readonly type: 'document.patch'; readonly patch: DocumentPatch }
  | { readonly type: 'document.order.move'; readonly refs: readonly CanvasItemRef[]; readonly to: CanvasOrderAnchor }
  | { readonly type: 'node.create'; readonly value: Node }
  | { readonly type: 'node.patch'; readonly id: NodeId; readonly patch: NodePatch }
  | { readonly type: 'node.delete'; readonly id: NodeId }
  | { readonly type: 'edge.create'; readonly value: Edge }
  | { readonly type: 'edge.patch'; readonly id: EdgeId; readonly patch: EdgePatch }
  | { readonly type: 'edge.delete'; readonly id: EdgeId }
  | { readonly type: 'group.create'; readonly value: Group }
  | { readonly type: 'group.patch'; readonly id: GroupId; readonly patch: GroupPatch }
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
  | { readonly type: 'mindmap.topic.patch'; readonly id: string; readonly topicId: NodeId; readonly patch: MindmapTopicPatch }
  | { readonly type: 'mindmap.branch.patch'; readonly id: string; readonly topicId: NodeId; readonly patch: MindmapBranchFieldPatch }
  | { readonly type: 'mindmap.topic.collapse'; readonly id: string; readonly topicId: NodeId; readonly collapsed?: boolean }

export type Operation = Op

export type Batch = {
  ops: readonly Op[]
  output?: unknown
}

export type ChangeSet = {
  document: boolean
  background: boolean
  order: boolean
  nodes: SharedIdDelta<NodeId>
  edges: SharedIdDelta<EdgeId>
  groups: SharedIdDelta<GroupId>
  mindmaps: SharedIdDelta<MindmapId>
}

export type Invalidation = {
  document: boolean
  background: boolean
  order: boolean
  nodes: Set<NodeId>
  edges: Set<EdgeId>
  groups: Set<GroupId>
  mindmaps: Set<MindmapId>
}
