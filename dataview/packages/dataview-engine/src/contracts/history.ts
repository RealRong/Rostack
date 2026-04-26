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
  DataviewErrorCode
} from '@dataview/engine/types/intent'
import type {
  EngineWrite
} from './write'

export interface DataviewHistoryConfig {
  enabled: boolean
  capacity: number
  captureSystem: boolean
  captureRemote: boolean
}

export type DataviewHistory = HistoryPort<
  MutationResult<void, EngineWrite>,
  DocumentOperation,
  DataviewMutationKey,
  EngineWrite
>
