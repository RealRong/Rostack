export type {
  MutationApplyResult,
  MutationCompileControl,
  MutationCompileProgramFactory,
  MutationCompileHandler,
  MutationCompileHandlerInput,
  MutationCompileHandlerTable,
  MutationCompileInput,
  MutationCompileIssue,
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
  MutationStructuralOrderedPatchOperation,
  MutationStructuralOrderedSpliceOperation,
  MutationStructuralTreeDeleteOperation,
  MutationStructuralTreeInsertOperation,
  MutationStructuralTreeMoveOperation,
  MutationStructuralTreeNodePatchOperation,
  MutationStructuralTreeRestoreOperation,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
  MutationResult
} from './contracts'
export type {
  AppliedMutationProgram,
  MutationEntityProgramStep,
  MutationEntityRef,
  MutationOrderedProgramStep,
  MutationProgram,
  MutationProgramStep,
  MutationTreeProgramStep,
} from './program/program'
export type {
  MutationProgramWriter
} from './program/writer'
export {
  createMutationProgramWriter
} from './program/writer'
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
  createStructuralOrderedPatchOperation,
  createStructuralOrderedSpliceOperation,
  createStructuralTreeDeleteOperation,
  createStructuralTreeInsertOperation,
  createStructuralTreeMoveOperation,
  createStructuralTreeNodePatchOperation,
  createStructuralTreeRestoreOperation,
  readStructuralEffectResult,
  readStructuralOperation,
  readStructuralOperationResult,
} from './structural'
export {
  MutationEngine
} from './runtime'
