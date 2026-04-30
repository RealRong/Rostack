import {
  history as historyRuntime,
  type HistoryController
} from '../history'
import {
  createHistoryPort,
  type HistoryPort
} from '../localHistory'
import type {
  ApplyCommit,
  CommitRecord,
  MutationCommitRecord,
  MutationIssue,
  MutationReplaceCommit,
  Origin,
} from '../write'
import {
  APPLY_EMPTY_CODE,
  COMPILE_APPLY_FAILED_CODE,
  COMPILE_BLOCKED_CODE,
  COMPILE_EMPTY_CODE,
  type CompileLoopResult,
  EXECUTE_EMPTY_CODE,
  EMPTY_COMPILE_ISSUES,
  EMPTY_DELTA,
  EMPTY_ISSUES,
  EMPTY_OUTPUTS,
  hasCompileErrors,
  isCompileControl,
  mutationFailure,
  MutationCustomReduceError,
  mutationSuccess,
  normalizeCompileIssue,
  readFirstOutput,
  type MutationApplyResult,
  type MutationCompileHandlerInput,
  type MutationCompileHandlerTable,
  type MutationCurrent,
  type MutationReaderFactory,
  type MutationCustomSpec,
  type MutationCustomTable,
  type MutationEngineOptions,
  type MutationExecuteInput,
  type MutationExecuteResult,
  type MutationExecuteResultOfInput,
  type MutationFailure,
  type MutationFootprint,
  type MutationHistoryOptions,
  type MutationIntentKind,
  type MutationIntentOf,
  type MutationIntentTable,
  type MutationOptions,
  type MutationOutputOf,
  type MutationResult,
  type MutationStructuralFact,
  type MutationStructureTable,
  type MutationStructureSource,
} from './contracts'
import {
  mergeMutationDeltas,
} from './delta'
import {
  applyMutationEffectProgram
} from './effect/effectApply'
import {
  materializeMutationEffectProgram
} from './effect/effectMaterialize'
import type {
  MutationEffect,
  MutationEffectProgram,
  MutationOrderedEffect,
  MutationTreeEffect,
} from './effect/effect'
import {
  createMutationEffectBuilder
} from './effect/effectBuilder'
import type {
  MutationEffectBuilder
} from './effect/effectBuilder'
import {
  compileEntities,
  readCanonicalOperation,
  lowerCanonicalEntityOperation,
} from './entity'
import {
  readStructuralEffectResult,
  lowerStructuralOperation,
  readStructuralOperation
} from './structural'
import {
  dedupeFootprints,
  mutationFootprintBatchConflicts
} from './footprint'
import type {
  CompiledEntitySpec,
  MutationEntityCanonicalOperation,
  MutationStructuralCanonicalOperation
} from './contracts'

const createCustomPlannerEffects = <
  Doc extends object,
  Tag extends string = string,
  Code extends string = string
>(input: {
  document: Doc
  structures?: MutationStructureSource<Doc>
  fail(issue: {
    code: Code
    message: string
  }): never
}) => {
  const builder = createMutationEffectBuilder<Tag>()

  const commitStructuralEffect = (
    effect: MutationOrderedEffect<Tag> | MutationTreeEffect<Tag>
  ): boolean => {
    const result = readStructuralEffectResult<Doc, Code>({
      document: input.document,
      effect,
      structures: input.structures
    })
    if (!result.ok) {
      return input.fail({
        code: result.error.code as Code,
        message: result.error.message
      })
    }
    if (result.data.historyMode === 'neutral') {
      return false
    }

    switch (effect.type) {
      case 'ordered.insert':
        builder.structure.ordered.insert(effect.structure, effect.itemId, effect.value, effect.to, effect.tags)
        return true
      case 'ordered.move':
        builder.structure.ordered.move(effect.structure, effect.itemId, effect.to, effect.tags)
        return true
      case 'ordered.splice':
        builder.structure.ordered.splice(effect.structure, effect.itemIds, effect.to, effect.tags)
        return true
      case 'ordered.delete':
        builder.structure.ordered.delete(effect.structure, effect.itemId, effect.tags)
        return true
      case 'ordered.patch':
        builder.structure.ordered.patch(effect.structure, effect.itemId, effect.patch, effect.tags)
        return true
      case 'tree.insert':
        builder.structure.tree.insert(
          effect.structure,
          effect.nodeId,
          effect.parentId,
          effect.index,
          effect.value,
          effect.tags
        )
        return true
      case 'tree.move':
        builder.structure.tree.move(
          effect.structure,
          effect.nodeId,
          effect.parentId,
          effect.index,
          effect.tags
        )
        return true
      case 'tree.delete':
        builder.structure.tree.delete(effect.structure, effect.nodeId, effect.tags)
        return true
      case 'tree.restore':
        builder.structure.tree.restore(effect.structure, effect.snapshot, effect.tags)
        return true
      case 'tree.node.patch':
        builder.structure.tree.patch(effect.structure, effect.nodeId, effect.patch, effect.tags)
        return true
    }
  }

  const effects: MutationEffectBuilder<Tag> = {
    entity: builder.entity,
    semantic: builder.semantic,
    build: builder.build,
    structure: {
      ordered: {
        insert: builder.structure.ordered.insert,
        delete: builder.structure.ordered.delete,
        move: (structure, itemId, to, tags) => {
          commitStructuralEffect({
            type: 'ordered.move',
            structure,
            itemId,
            to,
            ...(tags === undefined ? {} : { tags })
          })
        },
        splice: (structure, itemIds, to, tags) => {
          commitStructuralEffect({
            type: 'ordered.splice',
            structure,
            itemIds,
            to,
            ...(tags === undefined ? {} : { tags })
          })
        },
        patch: (structure, itemId, patch, tags) => {
          commitStructuralEffect({
            type: 'ordered.patch',
            structure,
            itemId,
            patch,
            ...(tags === undefined ? {} : { tags })
          })
        }
      },
      tree: {
        insert: builder.structure.tree.insert,
        delete: builder.structure.tree.delete,
        restore: builder.structure.tree.restore,
        move: (structure, nodeId, parentId, index, tags) => {
          commitStructuralEffect({
            type: 'tree.move',
            structure,
            nodeId,
            ...(parentId === undefined ? {} : { parentId }),
            ...(index === undefined ? {} : { index }),
            ...(tags === undefined ? {} : { tags })
          })
        },
        patch: (structure, nodeId, patch, tags) => {
          commitStructuralEffect({
            type: 'tree.node.patch',
            structure,
            nodeId,
            patch,
            ...(tags === undefined ? {} : { tags })
          })
        }
      }
    }
  }

  return effects
}

const readCustomOperationResult = <
  Doc extends object,
  Op extends {
    type: string
  },
  Reader,
  Services,
  Code extends string = string
>(input: {
  document: Doc
  operation: Op
  spec: MutationCustomSpec<Doc, Op, Op, Reader, Services, string, Code>
  createReader: MutationReaderFactory<Doc, Reader>
  entities: ReadonlyMap<string, CompiledEntitySpec>
  structures?: MutationStructureSource<Doc>
  services: Services | undefined
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op, Code> => {
  try {
    const effects = createCustomPlannerEffects<Doc, string, Code>({
      document: input.document,
      structures: input.structures,
      fail: (issue) => {
        throw new MutationCustomReduceError(issue)
      }
    })
    input.spec.plan({
      op: input.operation,
      document: input.document,
      reader: input.createReader(() => input.document),
      services: input.services,
      effects,
      fail: (issue) => {
        throw new MutationCustomReduceError(issue)
      }
    })
    const applied = applyMutationEffectProgram<Doc, Op, string, Code>({
      document: input.document,
      program: effects.build(),
      entities: input.entities,
      structures: input.structures,
      normalize: input.normalize
    })
    if (!applied.ok) {
      return applied
    }

    return {
      ok: true,
      data: {
        document: applied.data.document,
        applied: effects.build(),
        inverse: applied.data.inverse,
        delta: applied.data.delta,
        structural: applied.data.structural,
        footprint: applied.data.footprint,
        outputs: EMPTY_OUTPUTS,
        issues: applied.data.issues,
        historyMode: applied.data.historyMode
      }
    }
  } catch (error) {
    if (error instanceof MutationCustomReduceError) {
      return mutationFailure(
        error.issue.code as Code,
        error.issue.message,
        {
          ...(error.issue.path === undefined
            ? {}
            : {
                path: error.issue.path
              }),
          ...(error.issue.details === undefined
            ? {}
            : {
                details: error.issue.details
              })
        }
      )
    }

    return mutationFailure(
      'mutation_engine.custom.failed' as Code,
      error instanceof Error
        ? error.message
        : `Custom mutation operation "${input.operation.type}" failed.`
    )
  }
}

const shouldCaptureHistory = (
  history: MutationHistoryOptions | false | undefined,
  origin: Origin
): boolean => {
  if (history === false || origin === 'history') {
    return false
  }

  const configured = history?.capture?.[origin]
  if (configured !== undefined) {
    return configured
  }

  return origin === 'user'
}

const applyConcreteOperations = <
  Doc extends object,
  Op extends {
    type: string
  },
  Reader,
  Services,
  Code extends string = string
>(input: {
  document: Doc
  operations: readonly Op[]
  entities: ReadonlyMap<string, CompiledEntitySpec>
  structures?: MutationStructureSource<Doc>
  custom?: MutationCustomTable<Doc, Op, Reader, Services, string, Code>
  createReader: MutationReaderFactory<Doc, Reader>
  origin: Origin
  services: Services | undefined
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op, Code> => {
  let currentDocument = input.document
  let delta = EMPTY_DELTA
  const structural: MutationStructuralFact[] = []
  const authored: Op[] = []
  const appliedEffects: MutationEffect[] = []
  const inverseEffects: MutationEffect[] = []
  const footprint: MutationFootprint[] = []
  const outputs: unknown[] = []
  const issues: MutationIssue[] = []
  let hasTrackedHistory = false
  let skipHistory = false

  for (let index = 0; index < input.operations.length; index += 1) {
    const operation = input.operations[index]!
    const descriptor = readCanonicalOperation(operation.type)
    const structuralDescriptor = readStructuralOperation(operation.type)
    const customSpec = input.custom?.[operation.type]
    const applied = customSpec
      ? readCustomOperationResult<Doc, Op, Reader, Services, Code>({
          document: currentDocument,
          operation,
          spec: customSpec,
          createReader: input.createReader,
          entities: input.entities,
          structures: input.structures,
          services: input.services,
          normalize: input.normalize
        })
      : (() => {
        try {
          const program = structuralDescriptor
            ? lowerStructuralOperation(
                operation as unknown as MutationStructuralCanonicalOperation
              )
            : descriptor
            ? (() => {
                const spec = input.entities.get(descriptor.family)
                if (!spec) {
                  throw new Error(`Unknown mutation operation "${operation.type}".`)
                }
                return lowerCanonicalEntityOperation({
                  operation: operation as unknown as MutationEntityCanonicalOperation,
                  spec,
                  kind: descriptor.kind
                })
              })()
            : undefined

          if (!program) {
            return mutationFailure(
              'mutation_engine.apply.unknown_operation' as Code,
              `Unknown mutation operation "${operation.type}".`
            )
          }

          return applyMutationEffectProgram<Doc, Op, string, Code>({
            document: currentDocument,
            program,
            entities: input.entities,
            structures: input.structures,
            normalize: input.normalize
          })
        } catch (error) {
          return mutationFailure(
            'mutation_engine.apply.invalid_operation' as Code,
            error instanceof Error
              ? error.message
              : 'MutationEngine.apply received an invalid operation.'
          )
        }
      })()
    if (!applied.ok) {
      return mutationFailure(
        applied.error.code as Code,
        applied.error.message,
        applied.error.details
      )
    }

    currentDocument = applied.data.document
    delta = mergeMutationDeltas(delta, applied.data.delta)
    structural.push(...applied.data.structural)
    authored.push(operation)
    appliedEffects.push(...applied.data.applied.effects)
    footprint.push(...applied.data.footprint)
    outputs.push(...applied.data.outputs)
    issues.push(...applied.data.issues)
    if (applied.data.inverse.effects.length > 0) {
      inverseEffects.unshift(...applied.data.inverse.effects)
    }
    if (applied.data.historyMode === 'track') {
      hasTrackedHistory = true
    }
    if (applied.data.historyMode === 'skip') {
      skipHistory = true
    }
  }

  return {
    ok: true,
    data: {
      document: currentDocument,
      applied: {
        effects: appliedEffects
      },
      inverse: {
        effects: inverseEffects
      },
      delta,
      structural,
      footprint: dedupeFootprints(footprint),
      outputs,
      issues,
      historyMode: skipHistory
        ? 'skip'
        : hasTrackedHistory
          ? 'track'
          : 'neutral'
    }
  }
}

const compileMutationIntents = <
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Reader,
  Services,
  Code extends string = string
>(input: {
  document: Doc
  intents: readonly MutationIntentOf<Table>[]
  handlers: MutationCompileHandlerTable<Table, Doc, Op, Reader, Services, Code>
  origin: Origin
  services: Services | undefined
  entities: ReadonlyMap<string, CompiledEntitySpec>
  structures?: MutationStructureSource<Doc>
  custom?: MutationCustomTable<Doc, Op, Reader, Services, string, Code>
  createReader: MutationReaderFactory<Doc, Reader>
  normalize(doc: Doc): Doc
}): CompileLoopResult<Doc, Op, MutationOutputOf<Table>, Code> => {
  const ops: Op[] = []
  const outputs: MutationOutputOf<Table>[] = []
  const issues = []
  let workingDocument = input.document

  for (let index = 0; index < input.intents.length; index += 1) {
    const intent = input.intents[index]!
    const pendingOps: Op[] = []
    const pendingOutputs: MutationOutputOf<Table>[] = []
    const pendingIssues: ReturnType<typeof normalizeCompileIssue<Code>>[] = []
    let shouldStop = false
    let blocked = false

    const handler = input.handlers[intent.type as MutationIntentKind<Table>]
    if (!handler) {
      issues.push(normalizeCompileIssue({
        code: COMPILE_EMPTY_CODE as Code,
        message: `Missing compile handler for "${intent.type}".`,
        source: {
          index,
          type: intent.type
        }
      }))
      break
    }

    const controls: MutationCompileHandlerInput<
      Doc,
      MutationIntentOf<Table>,
      Op,
      MutationOutputOf<Table>,
      Reader,
      Services,
      Code
    > = {
      intent,
      source: {
        index,
        type: intent.type
      },
      document: workingDocument,
      reader: input.createReader(() => workingDocument),
      services: input.services,
      emit: (...nextOps) => {
        for (let opIndex = 0; opIndex < nextOps.length; opIndex += 1) {
          pendingOps.push(nextOps[opIndex]!)
        }
      },
      output: (value) => {
        pendingOutputs.push(value)
      },
      issue: (issue) => {
        const normalized = normalizeCompileIssue(issue)
        pendingIssues.push(normalized)
        if (normalized.severity !== 'warning') {
          blocked = true
        }
      },
      stop: () => {
        shouldStop = true
        return {
          kind: 'stop'
        }
      },
      fail: (issue) => {
        const normalized = normalizeCompileIssue(issue)
        pendingIssues.push(normalized)
        blocked = true
        return {
          kind: 'block',
          issue: normalized
        }
      },
      require: (value, issue) => {
        if (value !== undefined) {
          return value
        }

        controls.issue(issue)
        return undefined
      }
    }

    const result = handler(controls)
    if (isCompileControl(result)) {
      if (result.kind === 'stop') {
        shouldStop = true
      } else {
        blocked = true
      }
    }

    issues.push(...pendingIssues)
    outputs.push(...pendingOutputs)
    if (shouldStop || blocked) {
      break
    }

    if (pendingOps.length === 0) {
      continue
    }

    const applied = applyConcreteOperations<Doc, Op, Reader, Services, Code>({
      document: workingDocument,
      operations: pendingOps,
      entities: input.entities,
      structures: input.structures,
      custom: input.custom,
      createReader: input.createReader,
      origin: input.origin,
      services: input.services,
      normalize: input.normalize
    })
    if (!applied.ok) {
      issues.push(normalizeCompileIssue({
        code: COMPILE_APPLY_FAILED_CODE as Code,
        message: applied.error.message,
        details: applied.error.details,
        source: {
          index,
          type: intent.type
        }
      }))
      break
    }

    workingDocument = applied.data.document
    ops.push(...pendingOps)
  }

  return {
    ops,
    outputs,
    ...(issues.length > 0
      ? {
          issues
        }
      : {})
  }
}

class MutationRuntime<
  Doc extends object,
  Op extends {
    type: string
  },
  Reader,
  Services,
  Code extends string = string
> {
  readonly history: HistoryPort<
    MutationResult<void, ApplyCommit<Doc, Op, MutationFootprint, void>, Code>,
    MutationEffectProgram<string>,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void>
  >

  private readonly createReader: MutationReaderFactory<Doc, Reader>
  private readonly normalize: (doc: Doc) => Doc
  private readonly entities: ReadonlyMap<string, CompiledEntitySpec>
  private readonly structures?: MutationStructureSource<Doc>
  private readonly custom?: MutationCustomTable<Doc, Op, Reader, Services, string, Code>
  private readonly services: Services | undefined
  private readonly compileHandlers?: MutationCompileHandlerTable<any, Doc, Op, Reader, Services, Code>
  private readonly historyOptions?: MutationHistoryOptions | false
  private readonly historyControllerRef?: HistoryController<
    MutationEffectProgram<string>,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void>
  >
  private readonly watchListeners = new Set<(current: MutationCurrent<Doc>) => void>()
  private readonly commitListeners = new Set<(commit: CommitRecord<Doc, Op, MutationFootprint, void>) => void>()
  private rev = 0
  private documentState: Doc

  constructor(input: {
    document: Doc
    normalize(doc: Doc): Doc
    createReader: MutationReaderFactory<Doc, Reader>
    entities?: Readonly<Record<string, any>>
    structures?: MutationStructureSource<Doc>
    custom?: MutationCustomTable<Doc, Op, Reader, Services, string, Code>
    services?: Services
    compile?: MutationCompileHandlerTable<any, Doc, Op, Reader, Services, Code>
    history?: MutationHistoryOptions | false
  }) {
    this.createReader = input.createReader
    this.normalize = input.normalize
    this.entities = compileEntities(input.entities)
    this.structures = input.structures
    this.custom = input.custom
    this.services = input.services
    this.compileHandlers = input.compile
    this.historyOptions = input.history
    this.documentState = this.normalize(input.document)

    if (input.history !== false) {
      this.historyControllerRef = historyRuntime.create<
        MutationEffectProgram<string>,
        MutationFootprint,
        ApplyCommit<Doc, Op, MutationFootprint, void>
      >({
        capacity: input.history?.capacity,
        conflicts: mutationFootprintBatchConflicts
      })
    }

    this.history = createHistoryPort({
      applyProgram: (program, options) => this.applyProgram(program, options),
      commits: {
        subscribe: (listener) => {
          this.commitListeners.add(listener)
          return () => {
            this.commitListeners.delete(listener)
          }
        }
      },
      historyController: () => this.historyControllerRef
    })
  }

  document(): Doc {
    return this.documentState
  }

  reader(): Reader {
    return this.createReader(() => this.documentState)
  }

  current(): MutationCurrent<Doc> {
    return {
      rev: this.rev,
      document: this.documentState
    }
  }

  subscribe(
    listener: (commit: MutationCommitRecord<Doc, Op, MutationFootprint>) => void
  ): () => void {
    this.commitListeners.add(listener)
    return () => {
      this.commitListeners.delete(listener)
    }
  }

  watch(
    listener: (current: MutationCurrent<Doc>) => void
  ): () => void {
    this.watchListeners.add(listener)
    return () => {
      this.watchListeners.delete(listener)
    }
  }

  replace(
    document: Doc,
    options?: MutationOptions
  ): MutationReplaceCommit<Doc> {
    const nextDocument = this.normalize(document)
    const commit: MutationReplaceCommit<Doc> = {
      kind: 'replace',
      rev: this.rev + 1,
      at: Date.now(),
      origin: options?.origin ?? 'system',
      document: nextDocument,
      delta: {
        reset: true,
        changes: EMPTY_OUTPUTS as never
      },
      structural: EMPTY_OUTPUTS as readonly MutationStructuralFact[],
      issues: EMPTY_ISSUES,
      outputs: EMPTY_OUTPUTS
    }

    this.rev = commit.rev
    this.documentState = nextDocument
    this.historyControllerRef?.clear()
    this.emitCurrent()
    this.emitCommit(commit)
    return commit
  }

  apply(
    input: Op | readonly Op[],
    options?: MutationOptions
  ): MutationResult<
    void,
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    Code
  > {
    const operations: readonly Op[] = Array.isArray(input)
      ? input
      : [input]
    if (operations.length === 0) {
      return mutationFailure(
        APPLY_EMPTY_CODE as Code,
        'MutationEngine.apply requires at least one operation.'
      )
    }

    const applied = applyConcreteOperations<Doc, Op, Reader, Services, Code>({
      document: this.documentState,
      operations,
      entities: this.entities,
      structures: this.structures,
      custom: this.custom,
      createReader: this.createReader,
      origin: options?.origin ?? 'user',
      services: this.services,
      normalize: this.normalize
    })
    if (!applied.ok) {
      return applied
    }

    return this.commit({
      document: applied.data.document,
      authored: operations,
      applied: applied.data.applied,
      inverse: applied.data.inverse,
      delta: applied.data.delta,
      structural: applied.data.structural,
      footprint: applied.data.footprint,
      outputs: applied.data.outputs,
      issues: applied.data.issues,
      historyMode: applied.data.historyMode,
      origin: options?.origin ?? 'user',
      data: undefined
    })
  }

  execute<Table extends MutationIntentTable, Input extends MutationExecuteInput<Table>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    Table,
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    Input,
    Code
  > {
    const intents: readonly MutationIntentOf<Table>[] = Array.isArray(input)
      ? input
      : [input]
    if (intents.length === 0) {
      return mutationFailure(
        EXECUTE_EMPTY_CODE as Code,
        'MutationEngine.execute requires at least one intent.'
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void>,
        Input,
        Code
      >
    }

    if (!this.compileHandlers) {
      return mutationFailure(
        COMPILE_EMPTY_CODE as Code,
        'MutationEngine.execute requires compile handlers.'
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void>,
        Input,
        Code
      >
    }

    const planned = compileMutationIntents<Doc, Table, Op, Reader, Services, Code>({
      document: this.documentState,
      intents,
      handlers: this.compileHandlers,
      origin: options?.origin ?? 'user',
      services: this.services,
      entities: this.entities,
      structures: this.structures,
      custom: this.custom,
      createReader: this.createReader,
      normalize: this.normalize
    })
    const issues = (planned.issues ?? EMPTY_COMPILE_ISSUES).map(normalizeCompileIssue)
    const canApply = planned.canApply ?? (
      planned.ops.length > 0
      && !hasCompileErrors(issues)
    )

    if (!canApply) {
      return mutationFailure(
        COMPILE_BLOCKED_CODE as Code,
        'MutationEngine.execute was blocked by compile issues.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void>,
        Input,
        Code
      >
    }

    if (planned.ops.length === 0) {
      return mutationFailure(
        COMPILE_EMPTY_CODE as Code,
        'MutationEngine.execute produced no operations.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void>,
        Input,
        Code
      >
    }

    const applied = applyConcreteOperations<Doc, Op, Reader, Services, Code>({
      document: this.documentState,
      operations: planned.ops,
      entities: this.entities,
      structures: this.structures,
      custom: this.custom,
      createReader: this.createReader,
      origin: options?.origin ?? 'user',
      services: this.services,
      normalize: this.normalize
    })
    if (!applied.ok) {
      return mutationFailure(
        COMPILE_APPLY_FAILED_CODE as Code,
        applied.error.message,
        applied.error.details
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void>,
        Input,
        Code
      >
    }

    const committed = this.commit({
      document: applied.data.document,
      authored: planned.ops,
      applied: applied.data.applied,
      inverse: applied.data.inverse,
      delta: applied.data.delta,
      structural: applied.data.structural,
      footprint: applied.data.footprint,
      outputs: [
        ...planned.outputs,
        ...applied.data.outputs
      ],
      issues: [
        ...issues,
        ...applied.data.issues
      ],
      historyMode: applied.data.historyMode,
      origin: options?.origin ?? 'user',
      data: (
        Array.isArray(input)
          ? planned.outputs
          : readFirstOutput(planned.outputs)
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void>,
        Input,
        Code
      > extends MutationResult<infer Data, ApplyCommit<Doc, Op, MutationFootprint, void>, Code>
        ? Data
        : never
    })

    return committed as MutationExecuteResultOfInput<
      Table,
      ApplyCommit<Doc, Op, MutationFootprint, void>,
      Input,
      Code
    >
  }

  applyProgram(
    program: MutationEffectProgram<string>,
    options?: MutationOptions
  ): MutationResult<
    void,
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    Code
  > {
    const applied = applyMutationEffectProgram<Doc, Op, string, Code>({
      document: this.documentState,
      program,
      entities: this.entities,
      structures: this.structures,
      normalize: this.normalize
    })
    if (!applied.ok) {
      return applied
    }

    return this.commit({
      document: applied.data.document,
      authored: materializeMutationEffectProgram<Op>({
        program: applied.data.applied,
        entities: this.entities
      }),
      applied: applied.data.applied,
      inverse: applied.data.inverse,
      delta: applied.data.delta,
      structural: applied.data.structural,
      footprint: applied.data.footprint,
      outputs: applied.data.outputs,
      issues: applied.data.issues,
      historyMode: applied.data.historyMode,
      origin: options?.origin ?? 'user',
      data: undefined
    })
  }

  private commit<TData>(input: {
    document: Doc
    authored: readonly Op[]
    applied: MutationEffectProgram<string>
    inverse: MutationEffectProgram<string>
    delta: any
    structural: readonly MutationStructuralFact[]
    footprint: readonly MutationFootprint[]
    outputs: readonly unknown[]
    issues: readonly MutationIssue[]
    historyMode: 'track' | 'skip' | 'neutral'
    origin: Origin
    data: TData
  }): MutationResult<
    TData,
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    Code
  > {
    const commit: ApplyCommit<Doc, Op, MutationFootprint, void> = {
      kind: 'apply',
      rev: this.rev + 1,
      at: Date.now(),
      origin: input.origin,
      document: input.document,
      authored: input.authored,
      applied: input.applied,
      inverse: input.inverse,
      delta: input.delta,
      structural: input.structural,
      footprint: input.footprint,
      issues: input.issues,
      outputs: input.outputs,
      extra: undefined
    }

    this.rev = commit.rev
    this.documentState = input.document

    if (
      this.historyControllerRef
      && shouldCaptureHistory(this.historyOptions, input.origin)
      && input.historyMode === 'track'
      && commit.applied.effects.length > 0
      && commit.inverse.effects.length > 0
    ) {
      this.historyControllerRef.capture(commit)
    }

    this.emitCurrent()
    this.emitCommit(commit)
    return mutationSuccess<TData, ApplyCommit<Doc, Op, MutationFootprint, void>, Code>(
      input.data,
      commit
    )
  }

  private emitCurrent(): void {
    const current = this.current()
    this.watchListeners.forEach((listener) => {
      listener(current)
    })
  }

  private emitCommit(
    commit: CommitRecord<Doc, Op, MutationFootprint, void>
  ): void {
    this.commitListeners.forEach((listener) => {
      listener(commit)
    })
  }
}

export class MutationEngine<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Reader,
  Services = void,
  Code extends string = string
> {
  private readonly runtime: MutationRuntime<Doc, Op, Reader, Services, Code>

  constructor(input: MutationEngineOptions<Doc, Table, Op, Reader, Services, Code>) {
    this.runtime = new MutationRuntime({
      document: input.document,
      normalize: input.normalize,
      createReader: input.createReader,
      entities: input.entities,
      structures: input.structures,
      custom: input.custom,
      services: input.services,
      compile: input.compile,
      history: input.history
    })
  }

  get history(): HistoryPort<
    MutationResult<void, ApplyCommit<Doc, Op, MutationFootprint, void>, Code>,
    MutationEffectProgram<string>,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void>
  > {
    return this.runtime.history
  }

  current(): MutationCurrent<Doc> {
    return this.runtime.current()
  }

  document(): Doc {
    return this.runtime.document()
  }

  reader(): Reader {
    return this.runtime.reader()
  }

  execute<K extends MutationIntentKind<Table>>(
    intent: MutationIntentOf<Table, K>,
    options?: MutationOptions
  ): MutationExecuteResult<
    Table,
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    K,
    Code
  >
  execute(
    intents: readonly MutationIntentOf<Table>[],
    options?: MutationOptions
  ): MutationResult<
    readonly MutationOutputOf<Table>[],
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    Code
  >
  execute<Input extends MutationExecuteInput<Table>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    Table,
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    Input,
    Code
  > {
    return this.runtime.execute<Table, Input>(input, options)
  }

  apply(
    input: Op | readonly Op[],
    options?: MutationOptions
  ): MutationResult<
    void,
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    Code
  > {
    return this.runtime.apply(input, options)
  }

  applyProgram(
    program: MutationEffectProgram<string>,
    options?: MutationOptions
  ): MutationResult<
    void,
    ApplyCommit<Doc, Op, MutationFootprint, void>,
    Code
  > {
    return this.runtime.applyProgram(program, options)
  }

  replace(
    document: Doc,
    options?: MutationOptions
  ): MutationReplaceCommit<Doc> {
    return this.runtime.replace(document, options)
  }

  subscribe(
    listener: (commit: MutationCommitRecord<Doc, Op, MutationFootprint>) => void
  ): () => void {
    return this.runtime.subscribe(listener)
  }

  watch(
    listener: (current: MutationCurrent<Doc>) => void
  ): () => void {
    return this.runtime.watch(listener)
  }
}
