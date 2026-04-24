import { meta as mutationMeta, type OpSync } from '@shared/mutation'
import type { Operation } from '@whiteboard/core/types'

export type OperationType = Operation['type']

export type OperationFamily =
  | 'document'
  | 'node'
  | 'edge'
  | 'group'
  | 'mindmap'

export type OperationMeta = {
  family: OperationFamily
  sync?: OpSync
}

export type OperationMetaTable = Record<OperationType, OperationMeta>

const TABLE = {
  'document.replace': {
    family: 'document',
    sync: 'checkpoint'
  },
  'document.background': {
    family: 'document'
  },
  'canvas.order.move': {
    family: 'document'
  },
  'node.create': {
    family: 'node'
  },
  'node.restore': {
    family: 'node'
  },
  'node.field.set': {
    family: 'node'
  },
  'node.field.unset': {
    family: 'node'
  },
  'node.record.set': {
    family: 'node'
  },
  'node.record.unset': {
    family: 'node'
  },
  'node.delete': {
    family: 'node'
  },
  'edge.create': {
    family: 'edge'
  },
  'edge.restore': {
    family: 'edge'
  },
  'edge.field.set': {
    family: 'edge'
  },
  'edge.field.unset': {
    family: 'edge'
  },
  'edge.record.set': {
    family: 'edge'
  },
  'edge.record.unset': {
    family: 'edge'
  },
  'edge.label.insert': {
    family: 'edge'
  },
  'edge.label.delete': {
    family: 'edge'
  },
  'edge.label.move': {
    family: 'edge'
  },
  'edge.label.field.set': {
    family: 'edge'
  },
  'edge.label.field.unset': {
    family: 'edge'
  },
  'edge.label.record.set': {
    family: 'edge'
  },
  'edge.label.record.unset': {
    family: 'edge'
  },
  'edge.route.point.insert': {
    family: 'edge'
  },
  'edge.route.point.delete': {
    family: 'edge'
  },
  'edge.route.point.move': {
    family: 'edge'
  },
  'edge.route.point.field.set': {
    family: 'edge'
  },
  'edge.delete': {
    family: 'edge'
  },
  'group.create': {
    family: 'group'
  },
  'group.restore': {
    family: 'group'
  },
  'group.field.set': {
    family: 'group'
  },
  'group.field.unset': {
    family: 'group'
  },
  'group.delete': {
    family: 'group'
  },
  'mindmap.create': {
    family: 'mindmap'
  },
  'mindmap.restore': {
    family: 'mindmap'
  },
  'mindmap.delete': {
    family: 'mindmap'
  },
  'mindmap.move': {
    family: 'mindmap'
  },
  'mindmap.layout': {
    family: 'mindmap'
  },
  'mindmap.topic.insert': {
    family: 'mindmap'
  },
  'mindmap.topic.restore': {
    family: 'mindmap'
  },
  'mindmap.topic.move': {
    family: 'mindmap'
  },
  'mindmap.topic.delete': {
    family: 'mindmap'
  },
  'mindmap.topic.field.set': {
    family: 'mindmap'
  },
  'mindmap.topic.field.unset': {
    family: 'mindmap'
  },
  'mindmap.topic.record.set': {
    family: 'mindmap'
  },
  'mindmap.topic.record.unset': {
    family: 'mindmap'
  },
  'mindmap.branch.field.set': {
    family: 'mindmap'
  },
  'mindmap.branch.field.unset': {
    family: 'mindmap'
  },
  'mindmap.topic.collapse': {
    family: 'mindmap'
  }
} satisfies OperationMetaTable

export const META = mutationMeta.create<Operation>(TABLE)
