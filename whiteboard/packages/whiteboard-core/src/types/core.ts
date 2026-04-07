import type {
  MindmapDataMutation,
  MindmapInsertInput,
  MindmapCloneSubtreeInput,
  MindmapMoveSubtreeInput,
  MindmapRemoveSubtreeInput,
  MindmapNodeUpdateInput,
  MindmapUpdateNodeInput,
  MindmapNode,
  MindmapNodeData,
  MindmapNodeId,
  MindmapTree,
  MindmapId,
  MindmapLayoutOptions
} from '../mindmap/types'
import type { MindmapInsertPayload } from './mindmap'

export type {
  MindmapDataMutation,
  MindmapInsertInput,
  MindmapCloneSubtreeInput,
  MindmapMoveSubtreeInput,
  MindmapRemoveSubtreeInput,
  MindmapNodeUpdateInput,
  MindmapUpdateNodeInput,
  MindmapNode,
  MindmapNodeData,
  MindmapNodeId,
  MindmapTree,
  MindmapId,
  MindmapLayoutOptions
} from '../mindmap/types'
export type { MindmapInsertPayload } from './mindmap'

export type DocumentId = string
export type NodeId = string
export type EdgeId = string

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

export const NODE_TYPES = [
  'text',
  'sticky',
  'shape',
  'draw',
  'frame',
  'group',
  'mindmap'
] as const

export type NodeType = typeof NODE_TYPES[number]
export type SpatialNodeType = Exclude<NodeType, 'group'>
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
  children?: NodeId[]
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

export type GroupNode = BaseNode & {
  type: 'group'
}

export type Node =
  | SpatialNode
  | GroupNode

export type EdgeAnchor = {
  side: 'top' | 'right' | 'bottom' | 'left'
  offset: number
}

export type EdgeBaseType = 'linear' | 'step' | 'curve' | 'custom'
export type EdgeType = EdgeBaseType | (string & {})

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

export const isNodeEdgeEnd = (
  value: EdgeEnd
): value is NodeEdgeEnd => value.kind === 'node'

export const isPointEdgeEnd = (
  value: EdgeEnd
): value is PointEdgeEnd => value.kind === 'point'

export type EdgeRoute =
  | {
      kind: 'auto'
    }
  | {
      kind: 'manual'
      points: Point[]
    }

export const isManualEdgeRoute = (
  route: EdgeRoute | undefined
): route is Extract<EdgeRoute, { kind: 'manual' }> =>
  route?.kind === 'manual'

export type EdgeStyle = {
  stroke?: string
  strokeWidth?: number
  dash?: number[]
  animated?: boolean
  animationSpeed?: number
  markerStart?: string
  markerEnd?: string
}

export type EdgeLabel = {
  text?: string
  position?: 'center' | 'start' | 'end'
  offset?: Point
}

export interface Edge {
  id: EdgeId
  source: EdgeEnd
  target: EdgeEnd
  type: EdgeType
  route?: EdgeRoute
  style?: EdgeStyle
  label?: EdgeLabel
  data?: Record<string, unknown>
}

export type EntityCollection<TId extends string, T extends { id: TId }> = {
  entities: Record<TId, T>
  order: TId[]
}

export interface Document {
  id: DocumentId
  name?: string
  nodes: EntityCollection<NodeId, Node>
  edges: EntityCollection<EdgeId, Edge>
  background?: { type: 'dot' | 'line' | 'none'; color?: string }
  meta?: { createdAt?: string; updatedAt?: string }
}

const toOrderedItems = <TId extends string, T extends { id: TId }>(
  collection: EntityCollection<TId, T>
): T[] => {
  if (!collection.order.length) {
    return Object.values(collection.entities) as T[]
  }

  const ordered: T[] = []
  const visited = new Set<TId>()

  collection.order.forEach((id) => {
    const item = collection.entities[id]
    if (!item) return
    ordered.push(item)
    visited.add(id)
  })

  for (const item of Object.values(collection.entities) as T[]) {
    if (visited.has(item.id)) continue
    ordered.push(item)
  }

  return ordered
}

export const createDocument = (id: DocumentId): Document => ({
  id,
  nodes: {
    entities: {},
    order: []
  },
  edges: {
    entities: {},
    order: []
  }
})

export const getNode = (
  document: Pick<Document, 'nodes'>,
  id: NodeId
): Node | undefined => document.nodes.entities[id]

export const getEdge = (
  document: Pick<Document, 'edges'>,
  id: EdgeId
): Edge | undefined => document.edges.entities[id]

export const hasNode = (
  document: Pick<Document, 'nodes'>,
  id: NodeId
): boolean => Boolean(document.nodes.entities[id])

export const hasEdge = (
  document: Pick<Document, 'edges'>,
  id: EdgeId
): boolean => Boolean(document.edges.entities[id])

export const listNodes = (
  document: Pick<Document, 'nodes'>
): Node[] => toOrderedItems(document.nodes)

export const listEdges = (
  document: Pick<Document, 'edges'>
): Edge[] => toOrderedItems(document.edges)

const hasOwn = (target: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(target, key)

const assertEntityCollection = <TId extends string, T extends { id: TId }>(
  name: string,
  collection: EntityCollection<TId, T>
) => {
  if (!collection || typeof collection !== 'object' || Array.isArray(collection)) {
    throw new Error(`Document ${name} must be an entity collection.`)
  }

  if (!collection.entities || typeof collection.entities !== 'object' || Array.isArray(collection.entities)) {
    throw new Error(`Document ${name}.entities must be a record.`)
  }

  if (!Array.isArray(collection.order)) {
    throw new Error(`Document ${name}.order must be an array.`)
  }

  for (const id of collection.order) {
    if (typeof id !== 'string') {
      throw new Error(`Document ${name}.order must contain string ids.`)
    }
    if (!hasOwn(collection.entities, id)) {
      throw new Error(`Document ${name}.order contains missing entity ${id}.`)
    }
  }

  for (const [id, entity] of Object.entries(collection.entities) as Array<[TId, T]>) {
    if (!entity || typeof entity !== 'object') {
      throw new Error(`Document ${name}.entities.${id} must be an object.`)
    }
    if (entity.id !== id) {
      throw new Error(`Document ${name}.entities.${id} has mismatched entity id.`)
    }
    const maybeChildren = (entity as { children?: unknown }).children
    if (maybeChildren !== undefined && !Array.isArray(maybeChildren)) {
      throw new Error(`Document ${name}.entities.${id}.children must be an array.`)
    }
  }
}

export const assertDocument = (document: Document): Document => {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error('Document must be an object.')
  }

  if (typeof document.id !== 'string' || !document.id) {
    throw new Error('Document id is required.')
  }

  assertEntityCollection('nodes', document.nodes)
  assertEntityCollection('edges', document.edges)

  return document
}

export interface Snapshot {
  schemaVersion: string
  document: Document
}

export type SpatialNodeInput = Omit<SpatialNode, 'id'> & {
  id?: NodeId
  ownerId?: NodeId
}
export type GroupNodeInput = Omit<GroupNode, 'id'> & {
  id?: NodeId
  ownerId?: NodeId
}
export type NodeInput =
  | SpatialNodeInput
  | GroupNodeInput
export type EdgeInput = Omit<Edge, 'id'> & { id?: EdgeId }
export type NodeFieldPatch = {
  position?: Point
  size?: Size
  rotation?: number
  layer?: NodeLayer
  zIndex?: number
  children?: NodeId[]
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

export type DocumentPatch = {
  background?: Document['background']
}

// Operation is immutable once created. Any enrichment or normalization must
// return a new operation instead of mutating an existing one.
export type Operation =
  | { readonly type: 'document.update'; readonly patch: DocumentPatch }
  | { readonly type: 'node.create'; readonly node: Node }
  | { readonly type: 'node.update'; readonly id: NodeId; readonly update: NodeUpdateInput }
  | { readonly type: 'node.delete'; readonly id: NodeId }
  | { readonly type: 'node.order.set'; readonly ids: readonly NodeId[] }
  | { readonly type: 'edge.create'; readonly edge: Edge }
  | { readonly type: 'edge.update'; readonly id: EdgeId; readonly patch: EdgePatch }
  | { readonly type: 'edge.delete'; readonly id: EdgeId }
  | { readonly type: 'edge.order.set'; readonly ids: readonly EdgeId[] }

export interface ChangeSet {
  id: string
  timestamp: number
  operations: readonly Operation[]
  origin?: 'user' | 'remote' | 'system'
}

export interface NodeTypeDefinition {
  type: NodeType
  label?: string
  geometry?: 'rect' | 'shape'
  defaultData?: Record<string, unknown>
  schema?: NodeSchema
  validate?: (data: unknown) => boolean
}

export interface EdgeTypeDefinition {
  type: EdgeType
  label?: string
  defaultData?: Record<string, unknown>
  schema?: EdgeSchema
  validate?: (data: unknown) => boolean
}

export interface Serializer {
  type: string
  serialize(document: Document): unknown
  deserialize(input: unknown): Document
}

export interface Registry<T> {
  get(id: string): T | undefined
  list(): T[]
  register(definition: T): () => void
  unregister(id: string): void
  has(id: string): boolean
}

export interface SchemaRegistry {
  registerNode(schema: NodeSchema): () => void
  registerEdge(schema: EdgeSchema): () => void
  getNode(type: NodeType): NodeSchema | undefined
  getEdge(type: EdgeType): EdgeSchema | undefined
  listNodes(): NodeSchema[]
  listEdges(): EdgeSchema[]
}

export interface CoreRegistries {
  nodeTypes: Registry<NodeTypeDefinition>
  edgeTypes: Registry<EdgeTypeDefinition>
  schemas: SchemaRegistry
  serializers: Registry<Serializer>
}

export type Origin = 'user' | 'remote' | 'system'

export type ResultCode = 'cancelled' | 'invalid' | 'conflict' | 'unknown'

export type ErrorInfo<C extends string = string> = {
  code: C
  message: string
  details?: unknown
}

export type Result<T = void, C extends string = string> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: ErrorInfo<C>
    }

export function ok(): Result<void, never>
export function ok<T>(data: T): Result<T, never>
export function ok<T>(data?: T): Result<T, never> {
  return {
    ok: true,
    data: data as T
  }
}

export const err = <C extends string>(
  code: C,
  message: string,
  details?: unknown
): Result<never, C> => ({
  ok: false,
  error: {
    code,
    message,
    details
  }
})
