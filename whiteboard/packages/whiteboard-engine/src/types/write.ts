import type {
  Batch,
  ChangeSet,
  Document,
  Invalidation,
  Operation,
  Origin
} from '@whiteboard/core/types'
import type {
  HistoryConfig,
  HistoryState
} from '@whiteboard/core/kernel'
import type { KernelReadImpact } from '@whiteboard/core/kernel'
import type { Command, CommandOutput } from '@whiteboard/engine/types/command'
import type { CommandFailure } from '@whiteboard/engine/types/result'

export type DraftKind = 'apply' | 'replace' | 'undo' | 'redo'

type SuccessDraftBase<T> = {
  ok: true
  kind: DraftKind
  doc: Document
  operations: readonly Operation[]
  changes: ChangeSet
  invalidation: Invalidation
  impact: KernelReadImpact
  value: T
}

export type Draft<T = void> =
  | CommandFailure
  | (SuccessDraftBase<T> & {
      kind: DraftKind
      inverse: readonly Operation[]
    })

export type Writer = {
  execute: <C extends Command>(command: C, origin?: Origin) => Draft<CommandOutput<C>>
  apply: (
    batch: Batch,
    origin?: Origin
  ) => Draft<unknown>
  replace: (document: Document) => Draft
  undo: () => Draft
  redo: () => Draft
  history: {
    capture: (input: {
      operations: readonly Operation[]
      inverse?: readonly Operation[]
      origin?: Origin
    }) => void
    configure: (config: Partial<HistoryConfig>) => void
    get: () => HistoryState
    subscribe: (listener: () => void) => () => void
    clear: () => void
  }
}
