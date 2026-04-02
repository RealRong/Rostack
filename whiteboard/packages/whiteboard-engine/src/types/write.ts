import type {
  ChangeSet,
  Document,
  Operation,
  Origin,
} from '@whiteboard/core/types'
import type { HistoryConfig } from '@whiteboard/core/kernel'
import type { KernelReadImpact } from '@whiteboard/core/kernel'
import type {
  EngineCommands,
  WriteCommandMap,
  WriteDomain,
  WriteInput,
  WriteOutput
} from './command'
import type { CommandFailure, CommandResult } from './result'

export type Apply = <
  D extends WriteDomain,
  C extends WriteCommandMap[D]
>(input: WriteInput<D, C>) => CommandResult<WriteOutput<D, C>>

export type Write = {
  apply: Apply
  replace: EngineCommands['document']['replace']
  history: EngineCommands['history']
}

type SuccessfulWriteBase = {
  ok: true
  data: unknown
  doc: Document
  changes: ChangeSet
}

export type WriteResult<T = void> =
  | CommandFailure
  | (SuccessfulWriteBase & {
      data: T
      kind: 'operations'
      inverse?: readonly Operation[]
      impact: KernelReadImpact
    })
  | (SuccessfulWriteBase & {
      data: T
      kind: 'replace'
    })

export type WriteControl = {
  apply: <
    D extends WriteDomain,
    C extends WriteCommandMap[D]
  >(input: WriteInput<D, C>) => WriteResult<WriteOutput<D, C>>
  applyOperations: (
    operations: readonly Operation[],
    origin?: Origin
  ) => WriteResult
  replace: (document: Document) => WriteResult
  history: {
    configure: (config: Partial<HistoryConfig>) => void
    get: EngineCommands['history']['get']
    subscribe: (listener: () => void) => () => void
    clear: EngineCommands['history']['clear']
    undo: () => WriteResult | false
    redo: () => WriteResult | false
  }
}
