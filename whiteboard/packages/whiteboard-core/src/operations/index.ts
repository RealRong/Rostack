import { definitions } from '@whiteboard/core/operations/definitions'
import { spec } from '@whiteboard/core/operations/spec'
import {
  apply,
  deriveImpact,
  RESET_READ_IMPACT,
  summarizeInvalidation
} from '@whiteboard/core/operations/apply'
import { compile } from '@whiteboard/core/operations/compile'
import {
  assertHistoryFootprint,
  createCollector,
  conflicts,
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
  definitions,
  spec,
  apply,
  compile,
  history: {
    assertFootprint: assertHistoryFootprint,
    createCollector,
    conflicts,
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
  definitions,
  spec,
  apply,
  compile,
  RESET_READ_IMPACT,
  deriveImpact,
  summarizeInvalidation,
  assertHistoryFootprint,
  createCollector,
  conflicts,
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

export type {
  WhiteboardReduceIssueCode
} from '@whiteboard/core/reducer/types'
