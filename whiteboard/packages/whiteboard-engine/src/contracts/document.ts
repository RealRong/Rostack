import type {
  CanvasItemRef,
  CoreRegistries,
  Document,
  Edge,
  EdgeId,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
  Operation,
  Point,
  Rect
} from '@whiteboard/core/types'
import type { BoardConfig } from '@whiteboard/core/config'
import type { SliceExportResult } from '@whiteboard/core/document'
import type { MindmapLayoutSpec, MindmapTree } from '@whiteboard/core/mindmap'
import type { SnapCandidate } from '@whiteboard/core/node'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { ResolvedEdgeEnds } from '@whiteboard/core/types/edge'
import type { EngineWrite } from '../types/engineWrite'
import type {
  BatchApplyOptions,
  Command,
  CommandOutput,
  ExecuteOptions
} from './command'
import type { CommandResult } from './result'
import type {
  IdDelta,
  Revision
} from './core'
export type { IdDelta } from './core'

export interface Snapshot {
  revision: Revision
  state: State
}

export interface State {
  root: Document
  facts: Facts
}

export interface Facts {
  entities: Entities
  relations: Relations
}

export interface Entities {
  nodes: ReadonlyMap<NodeId, Node>
  edges: ReadonlyMap<EdgeId, Edge>
  owners: Owners
}

export interface Owners {
  mindmaps: ReadonlyMap<MindmapId, MindmapRecord>
  groups: ReadonlyMap<GroupId, Group>
}

export type OwnerRef =
  | {
      kind: 'mindmap'
      id: MindmapId
    }
  | {
      kind: 'group'
      id: GroupId
    }

export interface OwnerNodes {
  mindmaps: ReadonlyMap<MindmapId, readonly NodeId[]>
  groups: ReadonlyMap<GroupId, readonly NodeId[]>
}

export interface Relations {
  nodeOwner: ReadonlyMap<NodeId, OwnerRef | undefined>
  ownerNodes: OwnerNodes
  parentNode: ReadonlyMap<NodeId, NodeId | undefined>
  childNodes: ReadonlyMap<NodeId, readonly NodeId[]>
  edgeNodes: ReadonlyMap<EdgeId, EdgeNodes>
  groupItems: ReadonlyMap<GroupId, readonly CanvasItemRef[]>
}

export interface EdgeNodes {
  source?: NodeId
  target?: NodeId
}

export interface EngineChange {
  root: RootChange
  entities: EntityChange
  relations: RelationChange
}

export interface RootChange {
  doc: boolean
  background: boolean
  order: boolean
}

export interface EntityChange {
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
  mindmaps: IdDelta<MindmapId>
  groups: IdDelta<GroupId>
}

export interface RelationChange {
  graph: boolean
  ownership: boolean
  hierarchy: boolean
}

export interface EnginePublish {
  rev: Revision
  snapshot: Snapshot
  change: EngineChange
}

export interface EngineWrites {
  subscribe(listener: (write: EngineWrite) => void): () => void
}

export interface EngineNodeQueryItem {
  id: NodeId
  node: Node
  rect: Rect
  bounds: Rect
  rotation: number
}

export interface EngineEdgeQueryItem {
  id: EdgeId
  edge: Edge
  ends: ResolvedEdgeEnds
}

export interface EngineMindmapQueryItem {
  id: MindmapId
  rootId: NodeId
  nodeIds: readonly NodeId[]
  tree: MindmapTree
  layout: MindmapLayoutSpec
}

export interface EngineQuery {
  document(): Document
  background(): Document['background'] | undefined
  bounds(): Rect
  scene(): readonly CanvasItemRef[]
  frameOf(nodeId: NodeId): NodeId | undefined
  frameAt(point: Point): NodeId | undefined
  groupOfNode(nodeId: NodeId): GroupId | undefined
  groupTarget(groupId: GroupId): SelectionTarget | undefined
  groupExactIds(target: SelectionTarget): readonly GroupId[]
  snapCandidatesInRect(rect: Rect): readonly SnapCandidate[]
  sliceFromSelection(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
  nodeIds(): readonly NodeId[]
  node(id: NodeId): EngineNodeQueryItem | undefined
  edgeIds(): readonly EdgeId[]
  edge(id: EdgeId): EngineEdgeQueryItem | undefined
  relatedEdges(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  edgeIdsInRect(
    rect: Rect,
    options?: {
      match?: 'touch' | 'contain'
    }
  ): EdgeId[]
  mindmapIds(): readonly MindmapId[]
  mindmap(id: MindmapId | NodeId): EngineMindmapQueryItem | undefined
}

export interface Engine {
  readonly config: BoardConfig
  readonly query: EngineQuery
  readonly writes: EngineWrites
  current(): EnginePublish
  subscribe(listener: (publish: EnginePublish) => void): () => void
  execute<C extends Command>(
    command: C,
    options?: ExecuteOptions
  ): CommandResult<CommandOutput<C>>
  apply(
    ops: readonly Operation[],
    options?: BatchApplyOptions
  ): CommandResult
}

export interface CreateEngineOptions {
  registries?: CoreRegistries
  document: Document
  onDocumentChange?: (document: Document) => void
  config?: Partial<BoardConfig>
}
