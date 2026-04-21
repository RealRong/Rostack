import type { BoardConfig } from '@whiteboard/engine/types/instance'
import type { ReadSnapshot } from '@whiteboard/engine/types/internal/read'
import { createMindmapLayoutProjection } from '@whiteboard/engine/read/store/mindmap/layout'
import { createMindmapSceneRead } from '@whiteboard/engine/read/store/mindmap/scene'
import { createMindmapStructureProjection } from '@whiteboard/engine/read/store/mindmap/structure'
import type { Invalidation } from '@whiteboard/core/types'

export const createMindmapProjection = (
  initialSnapshot: ReadSnapshot,
  deps: {
    config: BoardConfig
  }
) => {
  const structure = createMindmapStructureProjection(initialSnapshot)
  const layout = createMindmapLayoutProjection(initialSnapshot, {
    config: deps.config,
    list: structure.list,
    structure: structure.item
  })
  const scene = createMindmapSceneRead({
    structure: structure.item,
    layout: layout.item
  })

  const applyChange = (
    invalidation: Invalidation,
    snapshot: ReadSnapshot
  ) => {
    structure.applyChange(invalidation, snapshot)
    layout.applyChange(invalidation, snapshot)
  }

  return {
    list: structure.list,
    structure: structure.item,
    layout: layout.item,
    scene,
    applyChange
  }
}
