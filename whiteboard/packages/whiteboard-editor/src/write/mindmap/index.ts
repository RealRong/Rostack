import type { Engine } from '@whiteboard/engine'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type { MindmapWrite } from '@whiteboard/editor/write/types'
import {
  createMindmapMoveWrite
} from '@whiteboard/editor/write/mindmap/root'
import {
  createMindmapTopicWrite
} from '@whiteboard/editor/write/mindmap/topic'
import {
  createMindmapBranchWrite
} from '@whiteboard/editor/write/mindmap/branch'

export const createMindmapWrite = ({
  engine,
  layout
}: {
  engine: Engine
  layout: WhiteboardLayoutService
}): MindmapWrite => ({
  create: (input) => engine.execute({
    type: 'mindmap.create',
    input: layout.commit({
      kind: 'mindmap.create',
      input,
      position: input.position
    }).input
  }),
  delete: (ids) => engine.execute({
    type: 'mindmap.delete',
    ids
  }),
  layout: {
    set: (id, nextLayout) => engine.execute({
      type: 'mindmap.layout.set',
      id,
      layout: nextLayout
    })
  },
  move: createMindmapMoveWrite(engine),
  topic: createMindmapTopicWrite({
    engine,
    layout
  }),
  branch: createMindmapBranchWrite(engine)
})
