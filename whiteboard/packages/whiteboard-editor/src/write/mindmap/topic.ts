import type { Engine } from '@whiteboard/engine'
import type { MindmapWrite } from '@whiteboard/editor/write/types'

export const createMindmapTopicWrite = ({
  engine
}: {
  engine: Engine
}): MindmapWrite['topic'] => ({
  insert: (id, input) => engine.execute({
    type: 'mindmap.topic.insert',
    id,
    input
  }),
  move: (id, input) => engine.execute({
    type: 'mindmap.topic.move',
    id,
    input
  }),
  delete: (id, input) => engine.execute({
    type: 'mindmap.topic.delete',
    id,
    input
  }),
  clone: (id, input) => engine.execute({
    type: 'mindmap.topic.clone',
    id,
    input
  }),
  update: (id, updates) => engine.execute({
    type: 'mindmap.topic.update',
    id,
    updates
  }),
  collapse: {
    set: (id, topicId, collapsed) => engine.execute({
      type: 'mindmap.topic.collapse.set',
      id,
      topicId,
      collapsed
    })
  }
})
