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

export const NODE_TYPES = [
  'text',
  'sticky',
  'shape',
  'draw',
  'frame',
  'mindmap'
] as const

export type NodeType = typeof NODE_TYPES[number]
export type SpatialNodeType = NodeType
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
  groupId?: GroupId
  route?: EdgeRoute
  style?: EdgeStyle
  label?: EdgeLabel
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

const EMPTY_ORDER: CanvasItemRef[] = []

const isCanvasItemRefEqual = (
  left: CanvasItemRef,
  right: CanvasItemRef
) => left.kind === right.kind && left.id === right.id

const appendMissingCanvasRefs = (
  ordered: CanvasItemRef[],
  visited: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[]
) => {
  refs.forEach((ref) => {
    if (visited.some((entry) => isCanvasItemRefEqual(entry, ref))) {
      return
    }
    ordered.push(ref)
  })
}

export const listCanvasItemRefs = (
  document: Pick<Document, 'nodes' | 'edges' | 'order'>
): CanvasItemRef[] => {
  const order = document.order ?? EMPTY_ORDER
  if (!order.length) {
    return [
      ...Object.keys(document.nodes).map((id) => ({ kind: 'node', id }) as const),
      ...Object.keys(document.edges).map((id) => ({ kind: 'edge', id }) as const)
    ]
  }

  const ordered: CanvasItemRef[] = []
  const visited: CanvasItemRef[] = []

  order.forEach((ref) => {
    if (ref.kind === 'node') {
      if (!document.nodes[ref.id]) {
        return
      }
    } else if (!document.edges[ref.id]) {
      return
    }

    ordered.push(ref)
    visited.push(ref)
  })

  appendMissingCanvasRefs(
    ordered,
    visited,
    Object.keys(document.nodes).map((id) => ({ kind: 'node', id }) as const)
  )
  appendMissingCanvasRefs(
    ordered,
    visited,
    Object.keys(document.edges).map((id) => ({ kind: 'edge', id }) as const)
  )

  return ordered
}

export const createDocument = (id: DocumentId): Document => ({
  id,
  nodes: {},
  edges: {},
  order: [],
  groups: {}
})

export const getNode = (
  document: Pick<Document, 'nodes'>,
  id: NodeId
): Node | undefined => document.nodes[id]

export const getEdge = (
  document: Pick<Document, 'edges'>,
  id: EdgeId
): Edge | undefined => document.edges[id]

export const getGroup = (
  document: Pick<Document, 'groups'>,
  id: GroupId
): Group | undefined => document.groups[id]

export const hasNode = (
  document: Pick<Document, 'nodes'>,
  id: NodeId
): boolean => Boolean(document.nodes[id])

export const hasEdge = (
  document: Pick<Document, 'edges'>,
  id: EdgeId
): boolean => Boolean(document.edges[id])

export const hasGroup = (
  document: Pick<Document, 'groups'>,
  id: GroupId
): boolean => Boolean(document.groups[id])

export const listNodes = (
  document: Pick<Document, 'nodes' | 'edges' | 'order'>
): Node[] => listCanvasItemRefs(document)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'node' }> => ref.kind === 'node')
  .map((ref) => document.nodes[ref.id])
  .filter((node): node is Node => Boolean(node))

export const listEdges = (
  document: Pick<Document, 'nodes' | 'edges' | 'order'>
): Edge[] => listCanvasItemRefs(document)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'edge' }> => ref.kind === 'edge')
  .map((ref) => document.edges[ref.id])
  .filter((edge): edge is Edge => Boolean(edge))

export const listGroups = (
  document: Pick<Document, 'groups'>
): Group[] => Object.values(document.groups)

const readCanvasItemGroupId = (
  document: Pick<Document, 'nodes' | 'edges'>,
  ref: CanvasItemRef
): GroupId | undefined => (
  ref.kind === 'node'
    ? document.nodes[ref.id]?.groupId
    : document.edges[ref.id]?.groupId
)

export const listGroupCanvasItemRefs = (
  document: Pick<Document, 'nodes' | 'edges' | 'order'>,
  groupId: GroupId
): CanvasItemRef[] => listCanvasItemRefs(document)
  .filter((ref) => readCanvasItemGroupId(document, ref) === groupId)

export const listGroupNodeIds = (
  document: Pick<Document, 'nodes' | 'edges' | 'order'>,
  groupId: GroupId
): NodeId[] => listGroupCanvasItemRefs(document, groupId)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'node' }> => ref.kind === 'node')
  .map((ref) => ref.id)

export const listGroupEdgeIds = (
  document: Pick<Document, 'nodes' | 'edges' | 'order'>,
  groupId: GroupId
): EdgeId[] => listGroupCanvasItemRefs(document, groupId)
  .filter((ref): ref is Extract<CanvasItemRef, { kind: 'edge' }> => ref.kind === 'edge')
  .map((ref) => ref.id)

const hasOwn = (target: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(target, key)

const assertEntityRecord = <TId extends string, T extends { id: TId }>(
  name: string,
  record: Record<TId, T>
) => {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error(`Document ${name} must be a record.`)
  }

  for (const [id, entity] of Object.entries(record) as Array<[TId, T]>) {
    if (!entity || typeof entity !== 'object') {
      throw new Error(`Document ${name}.${id} must be an object.`)
    }
    if (entity.id !== id) {
      throw new Error(`Document ${name}.${id} has mismatched entity id.`)
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

  assertEntityRecord('nodes', document.nodes)
  assertEntityRecord('edges', document.edges)
  assertEntityRecord('groups', document.groups)

  if (!Array.isArray(document.order)) {
    throw new Error('Document order must be an array.')
  }

  document.order.forEach((ref, index) => {
    if (!ref || typeof ref !== 'object') {
      throw new Error(`Document order.${index} must be an object.`)
    }
    if (ref.kind === 'node') {
      if (!hasOwn(document.nodes, ref.id)) {
        throw new Error(`Document order.${index} contains missing node ${ref.id}.`)
      }
      return
    }
    if (ref.kind === 'edge') {
      if (!hasOwn(document.edges, ref.id)) {
        throw new Error(`Document order.${index} contains missing edge ${ref.id}.`)
      }
      return
    }
    throw new Error(`Document order.${index} has invalid kind.`)
  })

  return document
}

export interface Snapshot {
  schemaVersion: string
  document: Document
}

export type SpatialNodeInput = Omit<SpatialNode, 'id'> & {
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
