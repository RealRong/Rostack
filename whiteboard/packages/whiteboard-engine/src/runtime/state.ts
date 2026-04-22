import type { Snapshot } from '../contracts/document'

export interface EngineState {
  snapshot: Snapshot
  listeners: Set<(snapshot: Snapshot) => void>
}
