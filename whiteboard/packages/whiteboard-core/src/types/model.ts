import type { Path } from '@shared/draft'
import type { EntityTable } from '@shared/core'
import type {
  MindmapId,
  MindmapLayoutSpec,
  MindmapNodeId,
  MindmapRecord
} from '@whiteboard/core/mindmap/types'
import type { MindmapTemplate } from '@whiteboard/core/types/template'

export type DocumentId = string
export type NodeId = string
export type EdgeId = string
export type GroupId = string

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type Viewport = { center: Point; zoom: number }
export type EdgeRoutePoint = Point & {
  id: string
}

export type NodeOutline =
  | {
      kind: 'rect'
      rect: Rect
      rotation: number
    }
  | {
      kind: 'polygon'
      points: Point[]
      sides: {
        top: Point[]
        right: Point[]
        bottom: Point[]
        left: Point[]
      }
    }

export type NodeGeometry = {
  rect: Rect
  outline: NodeOutline
  bounds: Rect
}

export type NodeType =
  | 'text'
  | 'sticky'
  | 'shape'
  | 'draw'
  | 'frame'

export type SpatialNodeType = NodeType
export type NodeRole = 'content' | 'frame'
export type NodeData = Record<string, unknown>
export type NodeStyleValue =
  | string
  | number
  | readonly number[]
export type NodeStyle = Record<string, NodeStyleValue>

export type Background = {
  type: 'dot' | 'line' | 'none'
  color?: string
}

export type NodeOwner =
  | {
      kind: 'mindmap'
      id: MindmapId
    }

export type BaseNode = {
  id: NodeId
  type: NodeType
  groupId?: GroupId
  owner?: NodeOwner
  locked?: boolean
  data?: NodeData
  style?: NodeStyle
}

export type SpatialNode = BaseNode & {
  type: SpatialNodeType
  position: Point
  size?: Size
  rotation?: number
}

export type Node = Omit<SpatialNode, 'size'> & {
  size: Size
}
export type NodeModel = Omit<Node, 'position' | 'size' | 'rotation'>
export type NodeRecord = Node

export type EdgeAnchor = {
  side: 'top' | 'right' | 'bottom' | 'left'
  offset: number
}

export type EdgeBaseType = 'straight' | 'elbow' | 'fillet' | 'curve' | 'custom'
export type EdgeType = EdgeBaseType | (string & {})
export type EdgeMarker =
  | 'arrow'
  | 'arrow-fill'
  | 'circle'
  | 'circle-fill'
  | 'diamond'
  | 'diamond-fill'
  | 'bar'
  | 'double-bar'
  | 'circle-arrow'
  | 'circle-bar'
export type EdgeDash = 'solid' | 'dashed' | 'dotted'
export type EdgeTextMode = 'horizontal' | 'tangent'

export type NodeEdgeEnd = {
  kind: 'node'
  nodeId: NodeId
  anchor?: EdgeAnchor
}

export type PointEdgeEnd = {
  kind: 'point'
  point: Point
}

export type EdgeEnd =
  | NodeEdgeEnd
  | PointEdgeEnd

export type EdgeStyle = {
  color?: string
  opacity?: number
  width?: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
}

export type EdgeLabelStyle = {
  size?: number
  weight?: number
  italic?: boolean
  color?: string
  bg?: string
}

export type EdgeLabel = {
  id: string
  text?: string
  t?: number
  offset?: number
  style?: EdgeLabelStyle
  data?: Record<string, unknown>
}

export interface Edge {
  id: EdgeId
  source: EdgeEnd
  target: EdgeEnd
  type: EdgeType
  locked?: boolean
  groupId?: GroupId
  points?: EntityTable<string, EdgeRoutePoint>
  style?: EdgeStyle
  textMode?: EdgeTextMode
  labels?: EntityTable<string, EdgeLabel>
  data?: Record<string, unknown>
}

export type EdgeRecord = Edge

export type CanvasItemRef =
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'mindmap'
      id: MindmapId
    }
  | {
      kind: 'edge'
      id: EdgeId
    }

export type Group = {
  id: GroupId
  locked?: boolean
  name?: string
}

export type GroupRecord = Group

export interface Document {
  id: DocumentId
  name?: string
  background?: Background
  order: CanvasItemRef[]
  nodes: Record<NodeId, NodeRecord>
  edges: Record<EdgeId, EdgeRecord>
  groups: Record<GroupId, GroupRecord>
  mindmaps: Record<MindmapId, MindmapRecord>
}

export interface Snapshot {
  document: Document
}

export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'color' | 'enum' | 'text'
export type SchemaFieldScope = 'data' | 'style' | 'label'

export type SchemaFieldOption = { label: string; value: string | number }

export type SchemaFieldVisibility = {
  scope?: SchemaFieldScope
  path: Path
  equals?: unknown
  notEquals?: unknown
  exists?: boolean
}

export type SchemaField = {
  id: string
  label: string
  type: SchemaFieldType
  scope?: SchemaFieldScope
  path: Path
  defaultValue?: unknown
  required?: boolean
  options?: readonly SchemaFieldOption[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
  description?: string
  readonly?: boolean
  visibleIf?: SchemaFieldVisibility
}

export type NodeSchema = {
  type: NodeType
  label?: string
  fields: SchemaField[]
}

export type EdgeSchema = {
  type: EdgeType
  label?: string
  fields: SchemaField[]
}

export type MindmapCreateInput = {
  id?: MindmapId
  position?: Point
  template: MindmapTemplate
}

export type MindmapLayoutHint = Partial<MindmapLayoutSpec> & {
  nodeSize?: Size
  anchorId?: MindmapNodeId
}

export type MindmapCommandOptions = {
  index?: number
  side?: 'left' | 'right'
  layout?: MindmapLayoutHint
}
