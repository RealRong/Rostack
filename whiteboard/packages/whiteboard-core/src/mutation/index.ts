export {
  whiteboardCompileHandlers,
  whiteboardMutationRegistry,
  validateWhiteboardOperationBatch,
  resolveLockDecision,
  validateLockOperations,
  isCheckpointOperation,
  isCheckpointProgram
} from '@whiteboard/core/operations'

export type {
  LockDecision,
  LockDecisionReason,
  LockOperationViolation,
  LockTarget,
  WhiteboardCompileCode,
  WhiteboardCompileContext,
  WhiteboardCompileHandlerTable,
  WhiteboardCompileIds,
  WhiteboardCompileServices,
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput,
  WhiteboardIntentTable,
  WhiteboardMutationTable
} from '@whiteboard/core/operations'
