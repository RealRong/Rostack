import type { EngineReadIndex } from '@whiteboard/engine/types/instance'
import type { ReadModel } from '@whiteboard/engine/types/read'

export type ReadSnapshot = {
  model: ReadModel
  index: EngineReadIndex
}
