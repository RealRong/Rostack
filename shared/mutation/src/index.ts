export type {
  MutationCompileHandlerTable,
  MutationCustomTable,
  MutationEntitySpec,
  MutationOrderedAnchor,
  MutationOrderedSlot,
  MutationReaderFactory,
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
} from './engine'
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
  MutationEngine
} from './engine'
export type {
  HistoryPort,
} from './localHistory'
export type {
  MutationDelta,
  MutationDeltaInput,
  MutationFootprint,
} from './write'
export {
  createDeltaBuilder,
  createTypedMutationDelta,
  defineEntityMutationSchema,
} from './typed'
