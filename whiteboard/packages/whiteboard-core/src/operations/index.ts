import { compile } from '@whiteboard/core/operations/compile'
import {
  whiteboardEntities
} from '@whiteboard/core/operations/entities'
import {
  reduceWhiteboardOperations,
  whiteboardCustom
} from '@whiteboard/core/operations/mutation'
import {
  assertHistoryFootprint,
  createCollector,
  isKey
} from '@whiteboard/core/operations/history'
import {
  resolveLockDecision,
  validateLockOperations
} from '@whiteboard/core/operations/lock'
import {
  canvasOrderMove,
  groupOrderMove
} from '@whiteboard/core/operations/plan'

export const operations = {
  entities: whiteboardEntities,
  custom: whiteboardCustom,
  compile,
  history: {
    assertFootprint: assertHistoryFootprint,
    createCollector,
    isKey
  },
  lock: {
    decide: resolveLockDecision,
    validate: validateLockOperations
  },
  plan: {
    canvasOrderMove,
    groupOrderMove
  }
} as const

export {
  whiteboardEntities,
  whiteboardCustom,
  reduceWhiteboardOperations,
  compile,
  assertHistoryFootprint,
  createCollector,
  isKey,
  resolveLockDecision,
  validateLockOperations,
  canvasOrderMove,
  groupOrderMove
}

export type {
  HistoryFootprint,
  HistoryKey,
  HistoryKeyCollector
} from '@whiteboard/core/operations/history'

export type {
  LockDecision,
  LockDecisionReason,
  LockOperationViolation,
  LockTarget
} from '@whiteboard/core/operations/lock'

export type {
  WhiteboardCompileIds,
  WhiteboardCompileScope,
  WhiteboardIntentHandler,
  CanvasIntent,
  DocumentIntent,
  EdgeBatchUpdate,
  EdgeIntent,
  GroupIntent,
  MindmapBranchBatchUpdate,
  MindmapIntent,
  MindmapTopicBatchUpdate,
  NodeBatchUpdate,
  NodeIntent,
  ReplaceDocumentIntent,
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput,
  WhiteboardIntentTable,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/compile'

export type {
  WhiteboardOperationReduceExtra,
  WhiteboardOperationReduceResult
} from '@whiteboard/core/operations/definitions'
