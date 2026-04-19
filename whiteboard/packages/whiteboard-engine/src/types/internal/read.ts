import type { EngineReadIndex } from '@whiteboard/engine/types/instance'
import type { ReadModel } from '@whiteboard/engine/types/read'
import type { Document } from '@whiteboard/core/types'

export type ReadSnapshot = {
  document: Document
  model: ReadModel
  index: EngineReadIndex
}
