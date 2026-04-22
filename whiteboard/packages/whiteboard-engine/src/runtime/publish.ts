import type { Snapshot } from '../contracts/document'
import type { EngineState } from './state'

export const publishSnapshot = (
  state: EngineState,
  snapshot: Snapshot
) => {
  state.snapshot = snapshot
  state.listeners.forEach((listener) => {
    listener(snapshot)
  })
}
