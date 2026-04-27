import type {
  CommitStream,
  HistoryPort,
  MutationOptions
} from '@shared/mutation'
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
import type { HistoryFootprint } from '@whiteboard/core/spec/history'
import type {
  EngineCommit,
  EngineApplyCommit
} from '../types/engineWrite'
import type {
  ExecuteResult,
  Intent,
  IntentKind
} from './intent'
import type { IntentResult } from './result'
import type {
  IdDelta,
  Revision
} from './core'
export type { IdDelta } from './core'
import type { WhiteboardMutationKey } from '../mutation/types'

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

export type EngineCommits = CommitStream<EngineCommit>

export interface Engine {
  readonly config: BoardConfig
  readonly commits: EngineCommits
  readonly history: HistoryPort<
    IntentResult,
    Operation,
    HistoryFootprint[number],
    EngineApplyCommit
  >
  doc(): Document
  current(): EnginePublish
  subscribe(listener: (publish: EnginePublish) => void): () => void
  execute<TIntent extends Intent>(
    intent: TIntent,
    options?: MutationOptions
  ): ExecuteResult<TIntent['type'] & IntentKind>
  replace(
    document: Document,
    options?: MutationOptions
  ): boolean
  apply(
    ops: readonly Operation[],
    options?: MutationOptions
  ): IntentResult
}

export interface CreateEngineOptions {
  registries?: CoreRegistries
  document: Document
  onDocumentChange?: (document: Document) => void
  config?: Partial<BoardConfig>
}
