import type {
  HistoryPort,
  MutationFootprint,
  MutationReplaceResult,
} from '@shared/mutation'
import type {
  MutationOptions
} from '@shared/mutation/engine'
import type {
  CoreRegistries,
  Document,
  Operation
} from '@whiteboard/core/types'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type { BoardConfig } from '@whiteboard/engine/config'
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
import type { Revision } from './core'

export interface EngineCurrent {
  rev: Revision
  doc: Document
}

export type EngineCommits = {
  subscribe(listener: (commit: EngineCommit) => void): () => void
}

export interface Engine {
  readonly config: BoardConfig
  readonly commits: EngineCommits
  readonly history: HistoryPort<
    IntentResult,
    Operation,
    MutationFootprint,
    EngineApplyCommit
  >
  doc(): Document
  current(): EngineCurrent
  subscribe(listener: (current: EngineCurrent) => void): () => void
  execute<TIntent extends Intent>(
    intent: TIntent,
    options?: MutationOptions
  ): ExecuteResult<TIntent['type'] & IntentKind>
  replace(
    document: Document,
    options?: MutationOptions
  ): MutationReplaceResult<Document>
  apply(
    ops: readonly Operation[],
    options?: MutationOptions
  ): IntentResult
}

export interface CreateEngineOptions {
  registries?: CoreRegistries
  document: Document
  layout: WhiteboardLayoutService
  onDocumentChange?: (document: Document) => void
  config?: Partial<BoardConfig>
}
