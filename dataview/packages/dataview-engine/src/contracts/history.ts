import type {
  HistoryPort,
  MutationResult
} from '@shared/mutation'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import type {
  DataviewMutationKey
} from '@dataview/core/mutation'
import type {
  EngineApplyCommit
} from './write'

export interface DataviewHistoryConfig {
  enabled: boolean
  capacity: number
  captureSystem: boolean
  captureRemote: boolean
}

export type DataviewHistory = HistoryPort<
  MutationResult<void, EngineApplyCommit>,
  DocumentOperation,
  DataviewMutationKey,
  EngineApplyCommit
>
