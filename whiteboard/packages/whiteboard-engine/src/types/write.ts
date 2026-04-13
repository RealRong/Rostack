import type { ChangeSet, Document, Operation, Origin } from '@whiteboard/core/types'
import type {
  HistoryConfig,
  HistoryState
} from '@whiteboard/core/kernel'
import type { KernelReadImpact } from '@whiteboard/core/kernel'
import type { CommandOutput, TranslateCommand } from './command'
import type { CommandFailure } from './result'

export type DraftKind = 'apply' | 'replace' | 'undo' | 'redo'

type SuccessDraftBase<T> = {
  ok: true
  kind: DraftKind
  doc: Document
  changes: ChangeSet
  value: T
}

export type Draft<T = void> =
  | CommandFailure
  | (SuccessDraftBase<T> & {
      kind: 'replace'
    })
  | (SuccessDraftBase<T> & {
      kind: Exclude<DraftKind, 'replace'>
      inverse?: readonly Operation[]
      impact: KernelReadImpact
    })

export type Writer = {
  run: <C extends TranslateCommand>(command: C, origin?: Origin) => Draft<CommandOutput<C>>
  ops: (
    operations: readonly Operation[],
    origin?: Origin
  ) => Draft
  replace: (document: Document) => Draft
  undo: () => Draft
  redo: () => Draft
  history: {
    capture: (input: {
      changes: ChangeSet
      inverse?: readonly Operation[]
    }) => void
    configure: (config: Partial<HistoryConfig>) => void
    get: () => HistoryState
    subscribe: (listener: () => void) => () => void
    clear: () => void
  }
}
