import type {
  MindmapInsertInput,
  NodeInput
} from '@whiteboard/core/types'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type { Engine } from '@whiteboard/engine'
import type { MindmapWrite } from '@whiteboard/editor/write/types'

const createTopicNodeSeed = (
  payload?: MindmapInsertInput['payload']
): NodeInput => {
  if (!payload) {
    return {
      type: 'text',
      position: { x: 0, y: 0 },
      data: {
        text: 'Topic'
      }
    }
  }

  switch (payload.kind) {
    case 'text':
      return {
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          text: typeof payload.text === 'string' ? payload.text : 'Topic'
        }
      }
    case 'file':
      return {
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          fileId: payload.fileId,
          name: payload.name
        }
      }
    case 'link':
      return {
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          url: payload.url,
          title: payload.title
        }
      }
    case 'ref':
      return {
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          ref: payload.ref,
          title: payload.title
        }
      }
    default:
      return {
        type: 'text',
        position: { x: 0, y: 0 },
        data: {
          ...payload
        }
      }
  }
}

export const createMindmapTopicWrite = ({
  engine,
  layout
}: {
  engine: Engine
  layout: WhiteboardLayoutService
}): MindmapWrite['topic'] => ({
  insert: (id, input) => engine.execute({
    type: 'mindmap.topic.insert',
    id,
    input: layout.commit({
      kind: 'mindmap.topic.insert',
      mindmapId: id,
      input: {
        ...input,
        node: input.node ?? createTopicNodeSeed(input.payload)
      }
    }).input
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
