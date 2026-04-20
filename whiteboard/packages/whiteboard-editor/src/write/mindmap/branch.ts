import type { Engine } from '@whiteboard/engine'
import type { MindmapWrite } from '@whiteboard/editor/write/types'

export const createMindmapBranchWrite = (
  engine: Engine
): MindmapWrite['branch'] => ({
  update: (id, updates) => engine.execute({
    type: 'mindmap.branch.update',
    id,
    updates
  })
})
