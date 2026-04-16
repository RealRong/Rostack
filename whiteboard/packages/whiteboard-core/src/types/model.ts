import type {
  MindmapId,
  MindmapLayoutOptions,
  MindmapNodeData,
  MindmapNodeId
} from '@whiteboard/core/mindmap/types'

export type DocumentId = string
export type NodeId = string
export type EdgeId = string
export type GroupId = string

export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type Rect = { x: number; y: number; width: number; height: number }
export type Viewport = { center: Point; zoom: number }

export type NodeOutline =
  | {
      kind: 'rect'
      rect: Rect
      rotation: number
    }
  | {
      kind: 'polygon'
      points: Point[]
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
  | 'mindmap'

export type SpatialNodeType = NodeType
export type NodeRole = 'content' | 'frame'
export type NodeLayer = 'background' | 'default' | 'overlay'
export type NodeData = Record<string, unknown>
export type NodeStyleValue =
  | string
  | number
  | readonly number[]
export type NodeStyle = Record<string, NodeStyleValue>

export type BaseNode = {
  id: NodeId
  type: NodeType
  layer?: NodeLayer
  zIndex?: number
  groupId?: GroupId
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

export type Node = SpatialNode

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
export type OrderMode =
  | 'set'
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'

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

export type EdgeRoute =
  | {
      kind: 'auto'
    }
  | {
      kind: 'manual'
      points: Point[]
    }

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
}

export interface Edge {
  id: EdgeId
  source: EdgeEnd
  target: EdgeEnd
  type: EdgeType
  locked?: boolean
  groupId?: GroupId
  route?: EdgeRoute
  style?: EdgeStyle
  textMode?: EdgeTextMode
  labels?: EdgeLabel[]
  data?: Record<string, unknown>
}

export type CanvasItemRef =
  | {
      kind: 'node'
      id: NodeId
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

export interface Document {
  id: DocumentId
  name?: string
  nodes: Record<NodeId, Node>
  edges: Record<EdgeId, Edge>
  order: CanvasItemRef[]
  groups: Record<GroupId, Group>
  background?: { type: 'dot' | 'line' | 'none'; color?: string }
  meta?: { createdAt?: string; updatedAt?: string }
}

export interface Snapshot {
  schemaVersion: string
  document: Document
}

export type SchemaFieldType = 'string' | 'number' | 'boolean' | 'color' | 'enum' | 'text'
export type SchemaFieldScope = 'data' | 'style' | 'label'

export type SchemaFieldOption = { label: string; value: string | number }

export type SchemaFieldVisibility = {
  scope?: SchemaFieldScope
  path: string
  equals?: unknown
  notEquals?: unknown
  exists?: boolean
}

export type SchemaField = {
  id: string
  label: string
  type: SchemaFieldType
  scope?: SchemaFieldScope
  path: string
  defaultValue?: unknown
  required?: boolean
  options?: SchemaFieldOption[]
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
  rootId?: MindmapNodeId
  rootData?: MindmapNodeData
}

export type MindmapLayoutHint = {
  nodeSize?: Size
  mode?: 'simple' | 'tidy'
  options?: MindmapLayoutOptions
  anchorId?: MindmapNodeId
}

export type MindmapCommandOptions = {
  index?: number
  side?: 'left' | 'right'
  layout?: MindmapLayoutHint
}
