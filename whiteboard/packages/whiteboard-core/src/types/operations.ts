import type { IdDelta as SharedIdDelta } from '@shared/delta'
import type { Path } from '@shared/mutation'
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
export type NodeRecordScope = 'data' | 'style'

export type NodeRecordMutation =
  | { scope: NodeRecordScope; op: 'set'; path?: Path; value: unknown }
  | { scope: NodeRecordScope; op: 'unset'; path: Path }

export type NodeUpdateInput = {
  fields?: NodeFieldPatch
  records?: readonly NodeRecordMutation[]
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
export type EdgeRecordScope = 'data' | 'style'
export type EdgeRecordMutation =
  | { scope: EdgeRecordScope; op: 'set'; path?: Path; value: unknown }
  | { scope: EdgeRecordScope; op: 'unset'; path: Path }

export type EdgeUpdateInput = {
  fields?: EdgeFieldPatch
  records?: readonly EdgeRecordMutation[]
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

export type EdgeLabelRecordMutation =
  | { scope: EdgeLabelRecordScope; op: 'set'; path?: Path; value: unknown }
  | { scope: EdgeLabelRecordScope; op: 'unset'; path: Path }

export type EdgeLabelUpdateInput = {
  fields?: EdgeLabelFieldPatch
  records?: readonly EdgeLabelRecordMutation[]
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

export type MindmapTopicRecordScope = 'data' | 'style'
export type MindmapTopicRecordMutation =
  | { scope: MindmapTopicRecordScope; op: 'set'; path?: Path; value: unknown }
  | { scope: MindmapTopicRecordScope; op: 'unset'; path: Path }

export type MindmapTopicUpdateInput = {
  fields?: MindmapTopicFieldPatch
  records?: readonly MindmapTopicRecordMutation[]
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
  | { readonly type: 'node.field.set'; readonly id: NodeId; readonly field: NodeField; readonly value: unknown }
  | { readonly type: 'node.field.unset'; readonly id: NodeId; readonly field: NodeUnsetField }
  | { readonly type: 'node.record.set'; readonly id: NodeId; readonly scope: NodeRecordScope; readonly path: Path; readonly value: unknown }
  | { readonly type: 'node.record.unset'; readonly id: NodeId; readonly scope: NodeRecordScope; readonly path: Path }
  | { readonly type: 'node.delete'; readonly id: NodeId }
  | { readonly type: 'edge.create'; readonly edge: Edge }
  | { readonly type: 'edge.restore'; readonly edge: Edge; readonly slot?: CanvasSlot }
  | { readonly type: 'edge.field.set'; readonly id: EdgeId; readonly field: EdgeField; readonly value: unknown }
  | { readonly type: 'edge.field.unset'; readonly id: EdgeId; readonly field: EdgeUnsetField }
  | { readonly type: 'edge.record.set'; readonly id: EdgeId; readonly scope: EdgeRecordScope; readonly path: Path; readonly value: unknown }
  | { readonly type: 'edge.record.unset'; readonly id: EdgeId; readonly scope: EdgeRecordScope; readonly path: Path }
  | { readonly type: 'edge.label.insert'; readonly edgeId: EdgeId; readonly label: EdgeLabel; readonly to: EdgeLabelAnchor }
  | { readonly type: 'edge.label.delete'; readonly edgeId: EdgeId; readonly labelId: string }
  | { readonly type: 'edge.label.move'; readonly edgeId: EdgeId; readonly labelId: string; readonly to: EdgeLabelAnchor }
  | { readonly type: 'edge.label.field.set'; readonly edgeId: EdgeId; readonly labelId: string; readonly field: EdgeLabelField; readonly value: unknown }
  | { readonly type: 'edge.label.field.unset'; readonly edgeId: EdgeId; readonly labelId: string; readonly field: EdgeLabelField }
  | { readonly type: 'edge.label.record.set'; readonly edgeId: EdgeId; readonly labelId: string; readonly scope: EdgeLabelRecordScope; readonly path: Path; readonly value: unknown }
  | { readonly type: 'edge.label.record.unset'; readonly edgeId: EdgeId; readonly labelId: string; readonly scope: EdgeLabelRecordScope; readonly path: Path }
  | { readonly type: 'edge.route.point.insert'; readonly edgeId: EdgeId; readonly point: EdgeRoutePoint; readonly to: EdgeRoutePointAnchor }
  | { readonly type: 'edge.route.point.delete'; readonly edgeId: EdgeId; readonly pointId: string }
  | { readonly type: 'edge.route.point.move'; readonly edgeId: EdgeId; readonly pointId: string; readonly to: EdgeRoutePointAnchor }
  | { readonly type: 'edge.route.point.field.set'; readonly edgeId: EdgeId; readonly pointId: string; readonly field: EdgeRoutePointField; readonly value: number }
  | { readonly type: 'edge.delete'; readonly id: EdgeId }
  | { readonly type: 'group.create'; readonly group: Group }
  | { readonly type: 'group.restore'; readonly group: Group }
  | { readonly type: 'group.field.set'; readonly id: GroupId; readonly field: GroupField; readonly value: unknown }
  | { readonly type: 'group.field.unset'; readonly id: GroupId; readonly field: GroupField }
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
  | { readonly type: 'mindmap.topic.field.set'; readonly id: string; readonly topicId: NodeId; readonly field: MindmapTopicField; readonly value: unknown }
  | { readonly type: 'mindmap.topic.field.unset'; readonly id: string; readonly topicId: NodeId; readonly field: MindmapTopicUnsetField }
  | { readonly type: 'mindmap.topic.record.set'; readonly id: string; readonly topicId: NodeId; readonly scope: MindmapTopicRecordScope; readonly path: Path; readonly value: unknown }
  | { readonly type: 'mindmap.topic.record.unset'; readonly id: string; readonly topicId: NodeId; readonly scope: MindmapTopicRecordScope; readonly path: Path }
  | { readonly type: 'mindmap.branch.field.set'; readonly id: string; readonly topicId: NodeId; readonly field: MindmapBranchField; readonly value: unknown }
  | { readonly type: 'mindmap.branch.field.unset'; readonly id: string; readonly topicId: NodeId; readonly field: MindmapBranchField }
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
