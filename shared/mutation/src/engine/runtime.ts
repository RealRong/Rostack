import {
  draft
} from '@shared/draft'
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
  type MutationResult
} from './contracts'
import {
  buildEntityDelta,
  hasDeltaFact,
  mergeMutationDeltas,
  normalizeMutationDelta
} from './delta'
import {
  applyRootWrites,
  appendTableCreateWrites,
  appendTableDeleteWrites,
  compileEntities,
  compileEntityPatchWrites,
  createCanonicalCreateOperation,
  createCanonicalDeleteOperation,
  createCanonicalPatchOperation,
  createPatchFromWrites,
  prefixRecordWrites,
  readCanonicalOperation,
  readChangedPathsFromWrites,
  readEntityAtPath,
  readEntityIdFromValue,
  readEntitySnapshotPaths,
  readRequiredId,
  readRequiredPatch,
  readRequiredValue,
  readSingletonPath,
  readTableEntityPath
} from './entity'
import {
  buildEntityFootprint,
  dedupeFootprints,
  mutationFootprintBatchConflicts
} from './footprint'
import type {
  CompiledEntitySpec,
  MutableRecordWrite,
  MutationCanonicalOperation
} from './contracts'

const readMutationIssues = (
  issues?: readonly MutationIssue[]
): readonly MutationIssue[] => issues ?? EMPTY_ISSUES

const readMutationOutputs = (
  outputs?: readonly unknown[]
): readonly unknown[] => outputs ?? EMPTY_OUTPUTS

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
  spec: MutationCustomSpec<Doc, Op, Op, Reader, Services, Code>
  createReader: MutationReaderFactory<Doc, Reader>
  origin: Origin
  services: Services | undefined
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op, Code> => {
  try {
    const result = input.spec.reduce({
      op: input.operation,
      document: input.document,
      reader: input.createReader(() => input.document),
      origin: input.origin,
      services: input.services,
      fail: (issue) => {
        throw new MutationCustomReduceError(issue)
      }
    })

    const next = result ?? {}
    const hasExplicitDelta = Object.prototype.hasOwnProperty.call(next, 'delta')
    const nextDocument = next.document === undefined
      ? input.document
      : input.normalize(next.document)
    const delta = normalizeMutationDelta(next.delta)
    const footprint = dedupeFootprints([
      ...(next.footprint ?? [])
    ])
    const outputs = readMutationOutputs(next.outputs)
    const issues = readMutationIssues(next.issues)
    const documentChanged = !Object.is(nextDocument, input.document)
    const hasEffects = documentChanged || hasDeltaFact(delta) || footprint.length > 0

    if (hasEffects && !hasExplicitDelta) {
      return mutationFailure(
        'mutation_engine.custom.delta_required' as Code,
        `Custom mutation operation "${input.operation.type}" must return delta unless it is a no-op.`
      )
    }

    if (next.history === false) {
      return {
        ok: true,
        data: {
          document: nextDocument,
          forward: [input.operation],
          inverse: [],
          delta,
          footprint,
          outputs,
          issues,
          historyMode: 'skip'
        }
      }
    }

    const forward = next.history?.forward ?? [input.operation]
    const inverse = next.history?.inverse ?? []

    if (hasEffects && inverse.length === 0) {
      return mutationFailure(
        'mutation_engine.custom.inverse_required' as Code,
        `Custom mutation operation "${input.operation.type}" must return history.inverse when it produces mutation effects.`
      )
    }

    if (inverse.length > 0 && forward.length === 0) {
      return mutationFailure(
        'mutation_engine.custom.forward_required' as Code,
        `Custom mutation operation "${input.operation.type}" must return replayable history.forward when the current op cannot be replayed.`
      )
    }

    return {
      ok: true,
      data: {
        document: nextDocument,
        forward,
        inverse,
        delta,
        footprint,
        outputs,
        issues,
        historyMode: inverse.length > 0
          ? 'track'
          : 'neutral'
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

const readSingletonCreateResult = <
  Doc extends object,
  Op extends {
    type: string
  }
>(input: {
  spec: CompiledEntitySpec
  document: Doc
  value: unknown
  normalize(doc: Doc): Doc
}) => {
  if (input.spec.family === 'document') {
    const nextDocument = input.normalize(input.value as Doc)
    const inverse = createCanonicalCreateOperation<Op>(
      input.spec.createType,
      input.document
    )
    const changedPaths = readEntitySnapshotPaths(input.spec, nextDocument)
    return {
      document: nextDocument,
      forward: [createCanonicalCreateOperation<Op>(
        input.spec.createType,
        input.value
      )],
      inverse: [inverse],
      delta: buildEntityDelta(
        input.spec,
        'create',
        undefined,
        changedPaths
      ),
      footprint: buildEntityFootprint(
        input.spec,
        'create',
        undefined,
        changedPaths
      ),
      outputs: EMPTY_OUTPUTS,
      issues: EMPTY_ISSUES,
      historyMode: 'track' as const
    }
  }

  const rootPath = readSingletonPath(input.spec)
  const writes = Object.freeze({
    [rootPath]: input.value
  })
  const nextDocument = applyRootWrites(input.document, writes)
  const inverse = createCanonicalDeleteOperation<Op>(
    input.spec.deleteType,
    undefined
  )
  const changedPaths = readEntitySnapshotPaths(input.spec, input.value)
  return {
    document: nextDocument,
    forward: [createCanonicalCreateOperation<Op>(
      input.spec.createType,
      input.value
    )],
    inverse: [inverse],
    delta: buildEntityDelta(
      input.spec,
      'create',
      undefined,
      changedPaths
    ),
    footprint: buildEntityFootprint(
      input.spec,
      'create',
      undefined,
      changedPaths
    ),
    outputs: EMPTY_OUTPUTS,
    issues: EMPTY_ISSUES,
    historyMode: 'track' as const
  }
}

const readSingletonDeleteResult = <
  Doc extends object,
  Op extends {
    type: string
  }
>(input: {
  spec: CompiledEntitySpec
  document: Doc
}) => {
  if (input.spec.family === 'document') {
    throw new Error('document.delete is not supported.')
  }

  const current = readEntityAtPath(input.document, input.spec.rootKey)
  if (current === undefined) {
    throw new Error(`Mutation operation "${input.spec.family}.delete" cannot find current value.`)
  }
  const writes = Object.freeze({
    [input.spec.rootKey]: undefined
  })
  const nextDocument = applyRootWrites(input.document, writes)
  const inverse = createCanonicalCreateOperation<Op>(
    input.spec.createType,
    current
  )
  const changedPaths = readEntitySnapshotPaths(input.spec, current)
  return {
    document: nextDocument,
    forward: [createCanonicalDeleteOperation<Op>(
      input.spec.deleteType,
      undefined
    )],
    inverse: [inverse],
    delta: buildEntityDelta(
      input.spec,
      'delete',
      undefined,
      changedPaths
    ),
    footprint: buildEntityFootprint(
      input.spec,
      'delete',
      undefined,
      changedPaths
    ),
    outputs: EMPTY_OUTPUTS,
    issues: EMPTY_ISSUES,
    historyMode: 'track' as const
  }
}

const readCanonicalOperationResult = <
  Doc extends object,
  Op extends {
    type: string
  }
>(input: {
  document: Doc
  operation: Op
  spec: CompiledEntitySpec
  kind: 'create' | 'patch' | 'delete'
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op> => {
  const operation = input.operation as MutationCanonicalOperation
  const spec = input.spec

  try {
    if (spec.kind !== 'singleton') {
      if (input.kind === 'create') {
        const value = readRequiredValue(spec.family, 'create', operation)
        const id = readEntityIdFromValue(spec.family, value)
        const entityPath = readTableEntityPath(spec, id)
        if (readEntityAtPath(input.document, entityPath) !== undefined) {
          throw new Error(`Mutation operation "${spec.family}.create" found an existing entity "${id}".`)
        }
        const writes: MutableRecordWrite = {
          [entityPath]: value
        }
        appendTableCreateWrites(writes, input.document, spec, id)
        const nextDocument = applyRootWrites(input.document, writes)
        const changedPaths = readEntitySnapshotPaths(spec, value)

        return {
          ok: true,
          data: {
            document: input.normalize(nextDocument),
            forward: [createCanonicalCreateOperation<Op>(
              spec.createType,
              value
            )],
            inverse: [createCanonicalDeleteOperation<Op>(spec.deleteType, id)],
            delta: buildEntityDelta(
              spec,
              'create',
              id,
              changedPaths
            ),
            footprint: buildEntityFootprint(
              spec,
              'create',
              id,
              changedPaths
            ),
            outputs: EMPTY_OUTPUTS,
            issues: EMPTY_ISSUES,
            historyMode: 'track'
          }
        }
      }

      if (input.kind === 'delete') {
        const id = readRequiredId(spec.family, operation)
        const entityPath = readTableEntityPath(spec, id)
        const current = readEntityAtPath(input.document, entityPath)
        if (current === undefined) {
          throw new Error(`Mutation operation "${spec.family}.delete" cannot find entity "${id}".`)
        }
        const writes: MutableRecordWrite = {
          [entityPath]: undefined
        }
        appendTableDeleteWrites(writes, input.document, spec, id)
        const nextDocument = applyRootWrites(input.document, writes)
        const changedPaths = readEntitySnapshotPaths(spec, current)

        return {
          ok: true,
          data: {
            document: input.normalize(nextDocument),
            forward: [createCanonicalDeleteOperation<Op>(spec.deleteType, id)],
            inverse: [createCanonicalCreateOperation<Op>(spec.createType, current)],
            delta: buildEntityDelta(
              spec,
              'delete',
              id,
              changedPaths
            ),
            footprint: buildEntityFootprint(
              spec,
              'delete',
              id,
              changedPaths
            ),
            outputs: EMPTY_OUTPUTS,
            issues: EMPTY_ISSUES,
            historyMode: 'track'
          }
        }
      }

      const id = readRequiredId(spec.family, operation)
      const entityPath = readTableEntityPath(spec, id)
      const current = readEntityAtPath(input.document, entityPath)
      if (current === undefined) {
        throw new Error(`Mutation operation "${spec.family}.patch" cannot find entity "${id}".`)
      }
      const patch = readRequiredPatch(spec.family, operation)
      const entityWrites = compileEntityPatchWrites(spec, patch)
      const changedPaths = readChangedPathsFromWrites(entityWrites)
      if (changedPaths.length === 0) {
        return {
          ok: true,
          data: {
            document: input.document,
            forward: [input.operation],
            inverse: [],
            delta: EMPTY_DELTA,
            footprint: [],
            outputs: EMPTY_OUTPUTS,
            issues: EMPTY_ISSUES,
            historyMode: 'neutral'
          }
        }
      }

      const nextEntity = draft.record.apply(current, entityWrites)
      const inverseWrites = draft.record.inverse(current, entityWrites)
      const rootWrites = prefixRecordWrites(entityPath, entityWrites)
      const nextDocument = applyRootWrites(input.document, rootWrites)

      return {
        ok: true,
        data: {
          document: input.normalize(nextDocument),
          forward: [input.operation],
          inverse: Object.keys(inverseWrites).length === 0
            ? []
            : [createCanonicalPatchOperation<Op>(
                spec.patchType,
                id,
                createPatchFromWrites(inverseWrites)
              )],
          delta: buildEntityDelta(
            spec,
            'patch',
            id,
            changedPaths
          ),
          footprint: buildEntityFootprint(
            spec,
            'patch',
            id,
            changedPaths
          ),
          outputs: EMPTY_OUTPUTS,
          issues: EMPTY_ISSUES,
          historyMode: Object.keys(inverseWrites).length === 0
            ? 'neutral'
            : 'track'
        }
      }
    }

    if (input.kind === 'create') {
      const value = readRequiredValue(spec.family, 'create', operation)
      return {
        ok: true,
        data: readSingletonCreateResult<Doc, Op>({
          spec,
          document: input.document,
          value,
          normalize: input.normalize
        })
      }
    }

    if (input.kind === 'delete') {
      return {
        ok: true,
        data: readSingletonDeleteResult<Doc, Op>({
          spec,
          document: input.document
        })
      }
    }

    const patch = readRequiredPatch(spec.family, operation)
    const entityWrites = compileEntityPatchWrites(spec, patch)
    const changedPaths = readChangedPathsFromWrites(entityWrites)
    if (changedPaths.length === 0) {
      return {
        ok: true,
        data: {
          document: input.document,
          forward: [input.operation],
          inverse: [],
          delta: EMPTY_DELTA,
          footprint: [],
          outputs: EMPTY_OUTPUTS,
          issues: EMPTY_ISSUES,
          historyMode: 'neutral'
        }
      }
    }

    const current = readEntityAtPath(input.document, readSingletonPath(spec))
    const nextEntity = draft.record.apply(current, entityWrites)
    const inverseWrites = draft.record.inverse(current, entityWrites)
    const rootWrites = prefixRecordWrites(readSingletonPath(spec), entityWrites)
    const nextDocument = spec.family === 'document'
      ? input.normalize(draft.record.apply(input.document, entityWrites))
      : input.normalize(applyRootWrites(input.document, rootWrites))

    return {
      ok: true,
      data: {
        document: nextDocument,
        forward: [input.operation],
        inverse: Object.keys(inverseWrites).length === 0
          ? []
          : [createCanonicalPatchOperation<Op>(
              spec.patchType,
              undefined,
              createPatchFromWrites(inverseWrites)
            )],
        delta: buildEntityDelta(
          spec,
          'patch',
          undefined,
          changedPaths
        ),
        footprint: buildEntityFootprint(
          spec,
          'patch',
          undefined,
          changedPaths
        ),
        outputs: EMPTY_OUTPUTS,
        issues: EMPTY_ISSUES,
        historyMode: Object.keys(inverseWrites).length === 0
          ? 'neutral'
          : 'track'
      }
    }
  } catch (error) {
    return mutationFailure(
      'mutation_engine.apply.invalid_operation',
      error instanceof Error
        ? error.message
        : 'MutationEngine.apply received an invalid canonical operation.'
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
  custom?: MutationCustomTable<Doc, Op, Reader, Services, Code>
  createReader: MutationReaderFactory<Doc, Reader>
  origin: Origin
  services: Services | undefined
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op, Code> => {
  let currentDocument = input.document
  let delta = EMPTY_DELTA
  const forward: Op[] = []
  const inverse: Op[] = []
  const footprint: MutationFootprint[] = []
  const outputs: unknown[] = []
  const issues: MutationIssue[] = []
  let hasTrackedHistory = false
  let skipHistory = false

  for (let index = 0; index < input.operations.length; index += 1) {
    const operation = input.operations[index]!
    const customSpec = input.custom?.[operation.type]
    const descriptor = readCanonicalOperation(operation.type)
    const applied = customSpec
      ? readCustomOperationResult<Doc, Op, Reader, Services, Code>({
          document: currentDocument,
          operation,
          spec: customSpec,
          createReader: input.createReader,
          origin: input.origin,
          services: input.services,
          normalize: input.normalize
        })
      : descriptor
        ? (() => {
          const spec = input.entities.get(descriptor.family)
          if (!spec) {
            return mutationFailure(
              'mutation_engine.apply.unknown_operation' as Code,
              `Unknown mutation operation "${operation.type}".`
            )
          }

          return readCanonicalOperationResult<Doc, Op>({
            document: currentDocument,
            operation,
            spec,
            kind: descriptor.kind,
            normalize: input.normalize
          })
        })()
        : mutationFailure(
            'mutation_engine.apply.unknown_operation' as Code,
            `Unknown mutation operation "${operation.type}".`
          )
    if (!applied.ok) {
      return mutationFailure(
        applied.error.code as Code,
        applied.error.message,
        applied.error.details
      )
    }

    currentDocument = applied.data.document
    delta = mergeMutationDeltas(delta, applied.data.delta)
    forward.push(...applied.data.forward)
    footprint.push(...applied.data.footprint)
    outputs.push(...applied.data.outputs)
    issues.push(...applied.data.issues)
    if (applied.data.inverse.length > 0) {
      inverse.unshift(...applied.data.inverse)
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
      forward,
      inverse,
      delta,
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
  custom?: MutationCustomTable<Doc, Op, Reader, Services, Code>
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
      emit: (operation) => {
        pendingOps.push(operation)
      },
      emitMany: (...nextOps) => {
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
    Op,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void>
  >

  private readonly createReader: MutationReaderFactory<Doc, Reader>
  private readonly normalize: (doc: Doc) => Doc
  private readonly entities: ReadonlyMap<string, CompiledEntitySpec>
  private readonly custom?: MutationCustomTable<Doc, Op, Reader, Services, Code>
  private readonly services: Services | undefined
  private readonly compileHandlers?: MutationCompileHandlerTable<any, Doc, Op, Reader, Services, Code>
  private readonly historyOptions?: MutationHistoryOptions | false
  private readonly historyControllerRef?: HistoryController<
    Op,
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
    custom?: MutationCustomTable<Doc, Op, Reader, Services, Code>
    services?: Services
    compile?: MutationCompileHandlerTable<any, Doc, Op, Reader, Services, Code>
    history?: MutationHistoryOptions | false
  }) {
    this.createReader = input.createReader
    this.normalize = input.normalize
    this.entities = compileEntities(input.entities)
    this.custom = input.custom
    this.services = input.services
    this.compileHandlers = input.compile
    this.historyOptions = input.history
    this.documentState = this.normalize(input.document)

    if (input.history !== false) {
      this.historyControllerRef = historyRuntime.create<
        Op,
        MutationFootprint,
        ApplyCommit<Doc, Op, MutationFootprint, void>
      >({
        capacity: input.history?.capacity,
        conflicts: mutationFootprintBatchConflicts
      })
    }

    this.history = createHistoryPort({
      apply: (operations, options) => this.apply(operations, options),
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
      forward: applied.data.forward,
      inverse: applied.data.inverse,
      delta: applied.data.delta,
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
      forward: applied.data.forward,
      inverse: applied.data.inverse,
      delta: applied.data.delta,
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

  private commit<TData>(input: {
    document: Doc
    forward: readonly Op[]
    inverse: readonly Op[]
    delta: any
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
      forward: input.forward,
      inverse: input.inverse,
      delta: input.delta,
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
      && commit.forward.length > 0
      && commit.inverse.length > 0
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
      custom: input.custom,
      services: input.services,
      compile: input.compile,
      history: input.history
    })
  }

  get history(): HistoryPort<
    MutationResult<void, ApplyCommit<Doc, Op, MutationFootprint, void>, Code>,
    Op,
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
