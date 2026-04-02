import type { EngineReadIndex } from '../instance'
import type { ReadModel } from '../read'

export type ReadSnapshot = {
  model: ReadModel
  index: EngineReadIndex
}
