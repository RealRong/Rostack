import type {
  Background,
  CanvasItemRef,
  Document,
  Edge,
  EdgeId,
  Group,
  GroupId,
  Node,
  NodeData,
  NodeId,
  NodeLayer,
  NodeOwner,
  NodeStyle,
  Point,
  Size
} from '@whiteboard/core/types/model'
import type {
  MindmapBranchPatch,
  MindmapLayoutSpec,
  MindmapRecord,
  MindmapTopicCloneInput,
  MindmapTopicDeleteInput,
  MindmapTopicInsertInput,
  MindmapTopicMoveInput,
  MindmapTopicPatch
} from '@whiteboard/core/mindmap/types'

export type SpatialNodeInput = Omit<Node, 'id'> & {
  id?: NodeId
}

export type NodeInput = SpatialNodeInput
export type EdgeInput = Omit<Edge, 'id'> & { id?: EdgeId }

export type NodeFieldPatch = {
  position?: Point
  size?: Size
  rotation?: number
  layer?: NodeLayer
  zIndex?: number
  groupId?: GroupId
  owner?: NodeOwner
  locked?: boolean
}

export type NodePatch = NodeFieldPatch & {
  data?: NodeData
  style?: NodeStyle
}

export type NodeRecordScope = 'data' | 'style'

export type NodeRecordMutation =
  | { scope: NodeRecordScope; op: 'set'; path?: string; value: unknown }
  | { scope: NodeRecordScope; op: 'unset'; path: string }
  | {
      scope: 'data'
      op: 'splice'
      path: string
      index: number
      deleteCount: number
      values?: readonly unknown[]
    }

export type NodeUpdateInput = {
  fields?: NodeFieldPatch
  records?: readonly NodeRecordMutation[]
}

export type EdgePatch = Partial<Omit<Edge, 'id'>>
export type GroupPatch = Partial<Omit<Group, 'id'>>
export type DocumentPatch = {
  background?: Document['background']
}

export type Origin = 'user' | 'remote' | 'system'

export type ChangeIds<Id extends string> = {
  add: Set<Id>
  update: Set<Id>
  delete: Set<Id>
}

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

export type Op =
  | { readonly type: 'document.replace'; readonly document: Document }
  | { readonly type: 'document.background'; readonly background?: Background }
  | { readonly type: 'canvas.order'; readonly refs: readonly CanvasItemRef[] }
  | { readonly type: 'node.create'; readonly node: Node }
  | { readonly type: 'node.restore'; readonly node: Node; readonly slot?: CanvasSlot }
  | { readonly type: 'node.patch'; readonly id: NodeId; readonly patch: NodePatch }
  | { readonly type: 'node.move'; readonly id: NodeId; readonly delta: Point }
  | { readonly type: 'node.delete'; readonly id: NodeId }
  | { readonly type: 'node.duplicate'; readonly id: NodeId }
  | { readonly type: 'edge.create'; readonly edge: Edge }
  | { readonly type: 'edge.restore'; readonly edge: Edge; readonly slot?: CanvasSlot }
  | { readonly type: 'edge.patch'; readonly id: EdgeId; readonly patch: EdgePatch }
  | { readonly type: 'edge.delete'; readonly id: EdgeId }
  | { readonly type: 'group.create'; readonly group: Group }
  | { readonly type: 'group.restore'; readonly group: Group }
  | { readonly type: 'group.patch'; readonly id: GroupId; readonly patch: GroupPatch }
  | { readonly type: 'group.delete'; readonly id: GroupId }
  | { readonly type: 'mindmap.create'; readonly mindmap: MindmapRecord; readonly nodes: Node[] }
  | { readonly type: 'mindmap.restore'; readonly snapshot: MindmapSnapshot }
  | { readonly type: 'mindmap.delete'; readonly id: string }
  | { readonly type: 'mindmap.root.move'; readonly id: string; readonly position: Point }
  | { readonly type: 'mindmap.layout'; readonly id: string; readonly patch: Partial<MindmapLayoutSpec> }
  | { readonly type: 'mindmap.topic.insert'; readonly id: string; readonly input: MindmapTopicInsertInput; readonly node: Node }
  | { readonly type: 'mindmap.topic.restore'; readonly id: string; readonly snapshot: MindmapTopicSnapshot }
  | { readonly type: 'mindmap.topic.move'; readonly id: string; readonly input: MindmapTopicMoveInput }
  | { readonly type: 'mindmap.topic.delete'; readonly id: string; readonly input: MindmapTopicDeleteInput }
  | { readonly type: 'mindmap.topic.clone'; readonly id: string; readonly input: MindmapTopicCloneInput }
  | { readonly type: 'mindmap.topic.patch'; readonly id: string; readonly topicIds: NodeId[]; readonly patch: MindmapTopicPatch }
  | { readonly type: 'mindmap.branch.patch'; readonly id: string; readonly topicIds: NodeId[]; readonly patch: MindmapBranchPatch }
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
  nodes: ChangeIds<NodeId>
  edges: ChangeIds<EdgeId>
  groups: ChangeIds<GroupId>
  mindmaps: ChangeIds<string>
}

export type Invalidation = {
  document: boolean
  background: boolean
  canvasOrder: boolean
  nodes: Set<NodeId>
  edges: Set<EdgeId>
  groups: Set<GroupId>
  mindmaps: Set<string>
  projections: Set<string>
}
