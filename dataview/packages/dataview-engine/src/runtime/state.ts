import type { DataDoc } from '@dataview/core/types'
import type {
  DataviewIndexBank
} from '@dataview/engine/active/index/runtime'
import type {
  DataviewLastActive
} from '@dataview/engine/active/state'

export interface ActiveProjectionState {
  lastActive?: DataviewLastActive
  index: DataviewIndexBank
}

export interface EngineState {
  rev: number
  doc: DataDoc
  active: ActiveProjectionState
}
