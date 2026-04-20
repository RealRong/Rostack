import type {
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
import type { Command, CommandOutput } from '@whiteboard/engine/types/command'
import type { CommandFailure } from '@whiteboard/engine/types/result'

export type Draft<T = void> =
  | CommandFailure
  | {
      ok: true
      origin: Origin
      doc: Document
      ops: readonly Operation[]
      inverse: readonly Operation[]
      changes: ChangeSet
      invalidation: Invalidation
      value: T
    }

export type Writer = {
  execute: <C extends Command>(command: C, origin?: Origin) => Draft<CommandOutput<C>>
  apply: (
    ops: readonly Operation[],
    origin?: Origin
  ) => Draft
  undo: () => Draft
  redo: () => Draft
  history: {
    configure: (config: Partial<HistoryConfig>) => void
    get: () => HistoryState
    subscribe: (listener: () => void) => () => void
    clear: () => void
  }
}
