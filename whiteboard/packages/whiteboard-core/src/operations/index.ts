export {
  whiteboardCompileHandlers
} from '@whiteboard/core/operations/compile'
export {
  whiteboardEntities
} from '@whiteboard/core/operations/entities'
export {
  whiteboardMutationRegistry
} from '@whiteboard/core/operations/targets'
export {
  validateWhiteboardOperationBatch
} from '@whiteboard/core/operations/validate'
export {
  resolveLockDecision,
  validateLockOperations
} from '@whiteboard/core/operations/lock'
export {
  isCheckpointOperation,
  isCheckpointProgram
} from '@whiteboard/core/operations/checkpoint'

export type {
  LockDecision,
  LockDecisionReason,
  LockOperationViolation,
  LockTarget
} from '@whiteboard/core/operations/lock'
export type {
  WhiteboardCompileCode,
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable,
  WhiteboardCompileIds,
  WhiteboardCompileServices
} from '@whiteboard/core/operations/compile'
export type {
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
} from '@whiteboard/core/operations/intents'
