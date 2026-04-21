import type { Engine } from '@whiteboard/engine'
import type { MindmapWrite } from '@whiteboard/editor/write/types'

export const createMindmapMoveWrite = (
  engine: Engine
): MindmapWrite['move'] => (
  (id, position) => engine.execute({
    type: 'mindmap.move',
    id,
    position
  })
)
