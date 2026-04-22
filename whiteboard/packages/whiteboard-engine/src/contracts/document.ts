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
  Operation
} from '@whiteboard/core/types'
import type { BoardConfig } from '@whiteboard/core/config'
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

export interface Engine {
  readonly config: BoardConfig
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
