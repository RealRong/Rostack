export type {
  MutationApplyResult,
  MutationCompileControl,
  MutationCompileHandler,
  MutationCompileHandlerInput,
  MutationCompileHandlerTable,
  MutationCompileInput,
  MutationCompileIssue,
  MutationCompileResult,
  MutationCurrent,
  MutationCustomFailure,
  MutationCustomHistoryResult,
  MutationCustomReduceInput,
  MutationCustomReduceResult,
  MutationReaderFactory,
  MutationCustomSpec,
  MutationCustomTable,
  MutationEngineOptions,
  MutationEntityEffectInput,
  MutationEntityPatch,
  MutationEntitySpec,
  MutationError,
  MutationExecuteInput,
  MutationExecuteResult,
  MutationExecuteResultOfInput,
  MutationFailure,
  MutationHistoryOptions,
  MutationIntentKind,
  MutationIntentOf,
  MutationIntentTable,
  MutationOrderedAnchor,
  MutationOrderedSlot,
  MutationOptions,
  MutationOutputOf,
  MutationStructureSpec,
  MutationStructureResolver,
  MutationStructureSource,
  MutationStructureTable,
  MutationStructuralCanonicalOperation,
  MutationStructuralFact,
  MutationStructuralOrderedDeleteOperation,
  MutationStructuralOrderedInsertOperation,
  MutationStructuralOrderedMoveOperation,
  MutationStructuralTreeDeleteOperation,
  MutationStructuralTreeInsertOperation,
  MutationStructuralTreeMoveOperation,
  MutationStructuralTreeRestoreOperation,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
  MutationResult
} from './contracts'
export {
  mutationFailure
} from './contracts'
export {
  buildEntityDelta,
  compileMutationEntityEffects,
  hasDeltaFact,
  mergeMutationDeltas,
  normalizeMutationDelta
} from './delta'
export {
  mutationFootprintBatchConflicts,
  mutationFootprintConflicts
} from './footprint'
export {
  applyStructuralOperation,
  createStructuralOrderedDeleteOperation,
  createStructuralOrderedInsertOperation,
  createStructuralOrderedMoveOperation,
  createStructuralTreeDeleteOperation,
  createStructuralTreeInsertOperation,
  createStructuralTreeMoveOperation,
  createStructuralTreeRestoreOperation,
  readStructuralOperation,
} from './structural'
export {
  MutationEngine
} from './runtime'
