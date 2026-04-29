import type {
  HistoryPort,
  MutationFootprint
} from '@shared/mutation'
import type {
  MutationResult
} from '@shared/mutation/engine'
import type { DocumentOperation } from '@dataview/core/op'
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
