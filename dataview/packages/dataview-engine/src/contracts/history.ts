import type {
  HistoryPort,
  MutationFootprint,
  MutationResult
} from '@shared/mutation'
import type {
  DocumentOperation
} from '@dataview/core/types/operations'
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
  MutationFootprint,
  EngineApplyCommit
>
