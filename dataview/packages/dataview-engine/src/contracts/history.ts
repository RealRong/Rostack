import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import type {
  DataviewMutationKey
} from '@dataview/core/mutation'
import type {
  HistoryController
} from '@shared/mutation'
import type {
  EngineWrite
} from './write'

export interface DataviewHistoryConfig {
  enabled: boolean
  capacity: number
  captureSystem: boolean
  captureRemote: boolean
}

export type DataviewHistory = HistoryController<
  DocumentOperation,
  DataviewMutationKey,
  EngineWrite
>
