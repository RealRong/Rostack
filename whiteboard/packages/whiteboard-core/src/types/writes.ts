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

export type EdgeInput = Omit<Edge, 'id' | 'points'> & {
  id?: EdgeId
  points?: Point[]
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
  points: Point[]
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
  tree: MindmapRecord['tree']
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
