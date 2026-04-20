import type { Engine } from '@whiteboard/engine'
import type { MindmapWrite } from '@whiteboard/editor/write/types'

export const createMindmapRootWrite = (
  engine: Engine
): MindmapWrite['root'] => ({
  move: (id, position) => engine.execute({
    type: 'mindmap.root.move',
    id,
    position
  })
})
