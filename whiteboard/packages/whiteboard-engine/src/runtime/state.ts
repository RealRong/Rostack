import type { Snapshot } from '../contracts/document'
import type { EngineWrite } from '../types/engineWrite'

export interface EngineState {
  snapshot: Snapshot
  listeners: Set<(snapshot: Snapshot) => void>
  lastWrite: EngineWrite | null
  writeListeners: Set<(write: EngineWrite) => void>
}
