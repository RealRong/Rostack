import type {
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
  NodeStyle,
  Point,
  Size
} from '@whiteboard/core/types/model'

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
  mindmapId?: NodeId
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

export type Operation =
  | { readonly type: 'document.update'; readonly patch: DocumentPatch }
  | { readonly type: 'node.create'; readonly node: Node }
  | { readonly type: 'node.update'; readonly id: NodeId; readonly update: NodeUpdateInput }
  | { readonly type: 'node.delete'; readonly id: NodeId }
  | { readonly type: 'group.create'; readonly group: Group }
  | { readonly type: 'group.update'; readonly id: GroupId; readonly patch: GroupPatch }
  | { readonly type: 'group.delete'; readonly id: GroupId }
  | { readonly type: 'edge.create'; readonly edge: Edge }
  | { readonly type: 'edge.update'; readonly id: EdgeId; readonly patch: EdgePatch }
  | { readonly type: 'edge.delete'; readonly id: EdgeId }
  | { readonly type: 'canvas.order.set'; readonly refs: readonly CanvasItemRef[] }

export interface ChangeSet {
  id: string
  timestamp: number
  operations: readonly Operation[]
  origin?: Origin
}
