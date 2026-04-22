import type { EnginePublish } from '../contracts/document'
import type { EngineWrite } from '../types/engineWrite'

export interface EngineState {
  publish: EnginePublish
  listeners: Set<(publish: EnginePublish) => void>
  writeListeners: Set<(write: EngineWrite) => void>
}
