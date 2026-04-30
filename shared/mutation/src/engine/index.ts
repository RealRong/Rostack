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
  MutationCustomPlannerInput,
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
  MutationStructuralOrderedSpliceOperation,
  MutationStructuralTreeDeleteOperation,
  MutationStructuralTreeInsertOperation,
  MutationStructuralTreeMoveOperation,
  MutationStructuralTreeRestoreOperation,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
  MutationResult
} from './contracts'
export type {
  AppliedMutationEffectProgram,
  MutationEntityEffect,
  MutationEntityRef,
  MutationEffect,
  MutationEffectProgram,
  MutationOrderedEffect,
  MutationTagEffect,
  MutationTreeEffect,
} from './effect/effect'
export type {
  MutationEffectBuilder
} from './effect/effectBuilder'
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
  createStructuralOrderedSpliceOperation,
  createStructuralTreeDeleteOperation,
  createStructuralTreeInsertOperation,
  createStructuralTreeMoveOperation,
  createStructuralTreeRestoreOperation,
  readStructuralEffectResult,
  readStructuralOperation,
  readStructuralOperationResult,
} from './structural'
export {
  MutationEngine
} from './runtime'
