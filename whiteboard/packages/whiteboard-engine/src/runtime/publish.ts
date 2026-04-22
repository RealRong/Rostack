import type { EnginePublish } from '../contracts/document'
import type { EngineState } from './state'

export const publishEngine = (
  state: EngineState,
  publish: EnginePublish
) => {
  state.publish = publish
  state.listeners.forEach((listener) => {
    listener(publish)
  })
}
