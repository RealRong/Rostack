import type { Engine } from '@whiteboard/engine'
import type { EditorQuery } from '@whiteboard/editor/query'
import type { EditorLayout } from '@whiteboard/editor/layout/runtime'
import type { MindmapWrite } from '@whiteboard/editor/write/types'
import {
  createMindmapRootWrite
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
  read: EditorQuery
  layout: EditorLayout
}): MindmapWrite => ({
  create: (input) => engine.execute({
    type: 'mindmap.create',
    input: {
      ...input,
      template: layout.patchMindmapTemplate(
        input.template,
        input.position
      )
    }
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
  root: createMindmapRootWrite(engine),
  topic: createMindmapTopicWrite({
    engine,
    layout
  }),
  branch: createMindmapBranchWrite(engine)
})
