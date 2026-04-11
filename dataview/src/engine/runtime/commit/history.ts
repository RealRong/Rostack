import type {
  BaseOperation
} from '@dataview/core/contracts/operations'

export interface HistoryReplay {
  kind: 'undo' | 'redo'
  operations: BaseOperation[]
}
