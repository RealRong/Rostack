import type { Engine } from '@whiteboard/engine'
import {
  patchMindmapTemplateByTextMeasure,
  type TextLayoutMeasure
} from '@whiteboard/editor/layout/textLayout'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
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
  registry,
  measure
}: {
  engine: Engine
  registry: Pick<NodeRegistry, 'get'>
  measure: TextLayoutMeasure
}): MindmapWrite => ({
  create: (input) => engine.execute({
    type: 'mindmap.create',
    input: {
      ...input,
      template: patchMindmapTemplateByTextMeasure({
        template: input.template,
        position: input.position,
        registry,
        measure
      })
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
  move: createMindmapMoveWrite(engine),
  topic: createMindmapTopicWrite({
    engine,
    registry,
    measure
  }),
  branch: createMindmapBranchWrite(engine)
})
