import type {
  MindmapInsertInput,
  NodeInput
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import {
  patchNodeCreateByTextMeasure,
  type TextLayoutMeasure
} from '@whiteboard/editor/layout/textLayout'
import type { NodeRegistry } from '@whiteboard/editor/types/node'
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

export const patchMindmapInsertInput = (
  registry: Pick<NodeRegistry, 'get'>,
  measure: TextLayoutMeasure,
  input: MindmapInsertInput
): MindmapInsertInput => {
  const patched = patchNodeCreateByTextMeasure({
    payload: createTopicNodeSeed(input.payload),
    registry,
    measure
  })

  return {
    ...input,
    node: {
      type: patched.type === 'frame'
        ? undefined
        : patched.type,
      data: patched.data,
      style: patched.style,
      size: patched.size,
      rotation: patched.rotation,
      locked: patched.locked
    }
  }
}

export const createMindmapTopicWrite = ({
  engine,
  registry,
  measure
}: {
  engine: Engine
  registry: Pick<NodeRegistry, 'get'>
  measure: TextLayoutMeasure
}): MindmapWrite['topic'] => ({
  insert: (id, input) => engine.execute({
    type: 'mindmap.topic.insert',
    id,
    input: patchMindmapInsertInput(registry, measure, input)
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
