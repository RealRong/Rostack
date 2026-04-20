import type { Operation } from '@whiteboard/core/types'

export type OperationType = Operation['type']

export type OperationNamespace =
  | 'document'
  | 'canvas'
  | 'node'
  | 'edge'
  | 'group'
  | 'mindmap'

export type OperationReducerFamily =
  | 'document'
  | 'node'
  | 'edge'
  | 'group'
  | 'mindmap'

export type OperationSyncMode =
  | 'live'
  | 'checkpoint-only'

export type OperationMeta<K extends OperationType = OperationType> = {
  type: K
  namespace: OperationNamespace
  reducer: OperationReducerFamily
  sync: OperationSyncMode
}

export type OperationMetaTable = {
  [K in OperationType]: OperationMeta<K>
}

type OperationLike =
  | OperationType
  | Pick<Operation, 'type'>

const readType = (
  input: OperationLike
): OperationType => typeof input === 'string'
  ? input
  : input.type

export const META: OperationMetaTable = {
  'document.replace': {
    type: 'document.replace',
    namespace: 'document',
    reducer: 'document',
    sync: 'checkpoint-only'
  },
  'document.background': {
    type: 'document.background',
    namespace: 'document',
    reducer: 'document',
    sync: 'live'
  },
  'canvas.order.move': {
    type: 'canvas.order.move',
    namespace: 'canvas',
    reducer: 'document',
    sync: 'live'
  },
  'node.create': {
    type: 'node.create',
    namespace: 'node',
    reducer: 'node',
    sync: 'live'
  },
  'node.restore': {
    type: 'node.restore',
    namespace: 'node',
    reducer: 'node',
    sync: 'live'
  },
  'node.field.set': {
    type: 'node.field.set',
    namespace: 'node',
    reducer: 'node',
    sync: 'live'
  },
  'node.field.unset': {
    type: 'node.field.unset',
    namespace: 'node',
    reducer: 'node',
    sync: 'live'
  },
  'node.record.set': {
    type: 'node.record.set',
    namespace: 'node',
    reducer: 'node',
    sync: 'live'
  },
  'node.record.unset': {
    type: 'node.record.unset',
    namespace: 'node',
    reducer: 'node',
    sync: 'live'
  },
  'node.delete': {
    type: 'node.delete',
    namespace: 'node',
    reducer: 'node',
    sync: 'live'
  },
  'edge.create': {
    type: 'edge.create',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.restore': {
    type: 'edge.restore',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.field.set': {
    type: 'edge.field.set',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.field.unset': {
    type: 'edge.field.unset',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.record.set': {
    type: 'edge.record.set',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.record.unset': {
    type: 'edge.record.unset',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.label.insert': {
    type: 'edge.label.insert',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.label.delete': {
    type: 'edge.label.delete',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.label.move': {
    type: 'edge.label.move',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.label.field.set': {
    type: 'edge.label.field.set',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.label.field.unset': {
    type: 'edge.label.field.unset',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.label.record.set': {
    type: 'edge.label.record.set',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.label.record.unset': {
    type: 'edge.label.record.unset',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.route.point.insert': {
    type: 'edge.route.point.insert',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.route.point.delete': {
    type: 'edge.route.point.delete',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.route.point.move': {
    type: 'edge.route.point.move',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.route.point.field.set': {
    type: 'edge.route.point.field.set',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'edge.delete': {
    type: 'edge.delete',
    namespace: 'edge',
    reducer: 'edge',
    sync: 'live'
  },
  'group.create': {
    type: 'group.create',
    namespace: 'group',
    reducer: 'group',
    sync: 'live'
  },
  'group.restore': {
    type: 'group.restore',
    namespace: 'group',
    reducer: 'group',
    sync: 'live'
  },
  'group.field.set': {
    type: 'group.field.set',
    namespace: 'group',
    reducer: 'group',
    sync: 'live'
  },
  'group.field.unset': {
    type: 'group.field.unset',
    namespace: 'group',
    reducer: 'group',
    sync: 'live'
  },
  'group.delete': {
    type: 'group.delete',
    namespace: 'group',
    reducer: 'group',
    sync: 'live'
  },
  'mindmap.create': {
    type: 'mindmap.create',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.restore': {
    type: 'mindmap.restore',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.delete': {
    type: 'mindmap.delete',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.root.move': {
    type: 'mindmap.root.move',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.layout': {
    type: 'mindmap.layout',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.insert': {
    type: 'mindmap.topic.insert',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.restore': {
    type: 'mindmap.topic.restore',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.move': {
    type: 'mindmap.topic.move',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.delete': {
    type: 'mindmap.topic.delete',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.field.set': {
    type: 'mindmap.topic.field.set',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.field.unset': {
    type: 'mindmap.topic.field.unset',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.record.set': {
    type: 'mindmap.topic.record.set',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.record.unset': {
    type: 'mindmap.topic.record.unset',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.branch.field.set': {
    type: 'mindmap.branch.field.set',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.branch.field.unset': {
    type: 'mindmap.branch.field.unset',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  },
  'mindmap.topic.collapse': {
    type: 'mindmap.topic.collapse',
    namespace: 'mindmap',
    reducer: 'mindmap',
    sync: 'live'
  }
}

export const meta = {
  get: <K extends OperationType>(
    type: K
  ): OperationMeta<K> => META[type]
}

export const sync = {
  mode: (
    type: OperationType
  ): OperationSyncMode => meta.get(type).sync,
  isLive: (
    input: OperationLike
  ): boolean => sync.mode(readType(input)) === 'live',
  isCheckpointOnly: (
    input: OperationLike
  ): boolean => sync.mode(readType(input)) === 'checkpoint-only'
}

