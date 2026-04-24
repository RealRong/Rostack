import type { WriteStream } from '@shared/mutation'
import type {
  CoreRegistries,
  Document,
  GroupId,
  NodeId,
  Operation,
  EdgeId,
  MindmapId
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
export type { IdDelta } from './core'

export interface Snapshot {
  revision: Revision
  document: Document
}

export interface EngineDelta {
  reset: boolean
  background: boolean
  order: boolean
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
  mindmaps: IdDelta<MindmapId>
  groups: IdDelta<GroupId>
}

export interface EnginePublish {
  rev: Revision
  snapshot: Snapshot
  delta: EngineDelta
}

export type EngineWrites = WriteStream<EngineWrite>

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
