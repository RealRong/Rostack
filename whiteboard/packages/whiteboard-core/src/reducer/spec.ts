import {
  Reducer,
  type ReducerSpec
} from '@shared/reducer'
import {
  validateLockOperations
} from '@whiteboard/core/lock'
import {
  serializeHistoryKey,
  type HistoryFootprint
} from '@whiteboard/core/spec/history'
import type {
  Document,
  Operation
} from '@whiteboard/core/types'
import {
  createWhiteboardReduceContext
} from './context'
import {
  createEmptyWhiteboardReduceExtra,
  finishWhiteboardReduce,
  readLockViolationMessage
} from './extra'
import {
  reduceDocumentOperation
} from './handlers/document'
import {
  reduceEdgeOperation
} from './handlers/edge'
import {
  reduceGroupOperation
} from './handlers/group'
import {
  reduceMindmapOperation
} from './handlers/mindmap'
import {
  reduceNodeOperation
} from './handlers/node'
import {
  collectWhiteboardHistory
} from './history'
import type {
  WhiteboardReduceCtx,
  WhiteboardReduceExtra,
  WhiteboardReduceIssueCode
} from './types'

export const whiteboardReducerSpec: ReducerSpec<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
> = {
  serializeKey: serializeHistoryKey,
  validate: ({
    doc,
    ops,
    origin
  }) => {
    const violation = validateLockOperations({
      document: doc,
      operations: ops,
      origin: origin === 'remote' || origin === 'system'
        ? origin
        : 'user'
    })

    return violation
      ? {
          code: 'cancelled',
          message: readLockViolationMessage(violation.reason, violation.operation)
        }
      : undefined
  },
  createContext: createWhiteboardReduceContext,
  beforeEach: (ctx, op) => {
    collectWhiteboardHistory(ctx, op)
  },
  handlers: {
    'document.replace': reduceDocumentOperation,
    'document.background': reduceDocumentOperation,
    'canvas.order.move': reduceDocumentOperation,
    'node.create': reduceNodeOperation,
    'node.restore': reduceNodeOperation,
    'node.field.set': reduceNodeOperation,
    'node.field.unset': reduceNodeOperation,
    'node.record.set': reduceNodeOperation,
    'node.record.unset': reduceNodeOperation,
    'node.delete': reduceNodeOperation,
    'edge.create': reduceEdgeOperation,
    'edge.restore': reduceEdgeOperation,
    'edge.field.set': reduceEdgeOperation,
    'edge.field.unset': reduceEdgeOperation,
    'edge.record.set': reduceEdgeOperation,
    'edge.record.unset': reduceEdgeOperation,
    'edge.label.insert': reduceEdgeOperation,
    'edge.label.delete': reduceEdgeOperation,
    'edge.label.move': reduceEdgeOperation,
    'edge.label.field.set': reduceEdgeOperation,
    'edge.label.field.unset': reduceEdgeOperation,
    'edge.label.record.set': reduceEdgeOperation,
    'edge.label.record.unset': reduceEdgeOperation,
    'edge.route.point.insert': reduceEdgeOperation,
    'edge.route.point.delete': reduceEdgeOperation,
    'edge.route.point.move': reduceEdgeOperation,
    'edge.route.point.field.set': reduceEdgeOperation,
    'edge.delete': reduceEdgeOperation,
    'group.create': reduceGroupOperation,
    'group.restore': reduceGroupOperation,
    'group.field.set': reduceGroupOperation,
    'group.field.unset': reduceGroupOperation,
    'group.delete': reduceGroupOperation,
    'mindmap.create': reduceMindmapOperation,
    'mindmap.restore': reduceMindmapOperation,
    'mindmap.delete': reduceMindmapOperation,
    'mindmap.move': reduceMindmapOperation,
    'mindmap.layout': reduceMindmapOperation,
    'mindmap.topic.insert': reduceMindmapOperation,
    'mindmap.topic.restore': reduceMindmapOperation,
    'mindmap.topic.move': reduceMindmapOperation,
    'mindmap.topic.delete': reduceMindmapOperation,
    'mindmap.topic.field.set': reduceMindmapOperation,
    'mindmap.topic.field.unset': reduceMindmapOperation,
    'mindmap.topic.record.set': reduceMindmapOperation,
    'mindmap.topic.record.unset': reduceMindmapOperation,
    'mindmap.branch.field.set': reduceMindmapOperation,
    'mindmap.branch.field.unset': reduceMindmapOperation,
    'mindmap.topic.collapse': reduceMindmapOperation
  },
  settle: (ctx) => {
    ctx.mindmap.flush()
  },
  done: finishWhiteboardReduce,
  emptyExtra: createEmptyWhiteboardReduceExtra
}

export const whiteboardReducer = new Reducer<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardReduceExtra,
  WhiteboardReduceCtx,
  WhiteboardReduceIssueCode
>({
  spec: whiteboardReducerSpec
})
