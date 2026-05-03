import type {
  MutationOrigin,
  MutationWrite,
} from '@shared/mutation'
import type {
  CoreRegistries,
  Document
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

export type MutationOptions = {
  origin?: MutationOrigin
  history?: boolean
}

export interface EngineCurrent {
  rev: Revision
  doc: Document
}

export type EngineCommits = {
  subscribe(listener: (commit: EngineCommit) => void): () => void
}

export type EngineHistory = {
  state(): {
    undoDepth: number
    redoDepth: number
  }
  canUndo(): boolean
  canRedo(): boolean
  undo(): IntentResult | undefined
  redo(): IntentResult | undefined
  clear(): void
}

export interface Engine {
  readonly config: BoardConfig
  readonly commits: EngineCommits
  readonly history: EngineHistory
  doc(): Document
  rev(): Revision
  subscribe(listener: (current: EngineCurrent) => void): () => void
  execute<TIntent extends Intent>(
    intent: TIntent,
    options?: MutationOptions
  ): ExecuteResult<TIntent['type'] & IntentKind>
  replace(
    document: Document,
    options?: MutationOptions
  ): EngineCommit
  apply(
    writes: readonly MutationWrite[],
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
