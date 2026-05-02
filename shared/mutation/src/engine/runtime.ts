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
  MutationDelta,
  MutationFootprint,
  MutationIssue,
  MutationReplaceCommit,
  Origin,
} from '../write'
import {
  compileMutationModel,
  createMutationDelta,
  createMutationReader,
  createMutationWriter,
  type MutationSchemaDefinition,
} from '../model'
import {
  APPLY_EMPTY_CODE,
  COMPILE_APPLY_FAILED_CODE,
  COMPILE_BLOCKED_CODE,
  COMPILE_EMPTY_CODE,
  EXECUTE_EMPTY_CODE,
  EMPTY_COMPILE_ISSUES,
  EMPTY_DELTA,
  EMPTY_ISSUES,
  EMPTY_OUTPUTS,
  hasCompileErrors,
  isCompileControl,
  mutationFailure,
  mutationSuccess,
  normalizeCompileIssue,
  type MutationApplyResult,
  type MutationCompileDefinition,
  type MutationCompileHandlerInput,
  type MutationCompileControl,
  type MutationCompileIssue,
  type MutationCurrent,
  type MutationEngineOptions,
  type MutationExecuteInput,
  type MutationExecuteResult,
  type MutationExecuteResultOfInput,
  type MutationHistoryOptions,
  type MutationIntent,
  type MutationOptions,
  type MutationResult,
  type MutationStructuralFact,
  type CompiledEntitySpec,
  type CompiledOrderedSpec,
  type CompiledTreeSpec,
} from './contracts'
import {
  mergeMutationDeltas,
  normalizeMutationDelta,
} from './delta'
import {
  dedupeFootprints,
  mutationFootprintBatchConflicts,
} from './footprint'
import {
  applyMutationProgram
} from './program/apply'
import type {
  MutationProgram,
  MutationProgramStep,
} from './program/program'
import {
  createMutationProgramWriter,
  type MutationProgramWriter,
} from './program/writer'

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

type CompiledIntentProgramResult<
  Doc,
  Output,
  Code extends string = string
> = {
  document: Doc
  applied: MutationProgram
  inverse: MutationProgram
  delta: MutationDelta
  structural: readonly MutationStructuralFact[]
  footprint: readonly MutationFootprint[]
  outputs: readonly Output[]
  issues?: readonly MutationCompileIssue<Code>[]
  historyMode: 'track' | 'skip' | 'neutral'
}

const compileMutationIntents = <
  Doc extends object,
  TIntent extends MutationIntent,
  Writer,
  Reader,
  Services,
  Code extends string,
  Context extends Record<string, unknown>,
  Output = unknown
>(input: {
  schema: MutationSchemaDefinition<Doc>
  document: Doc
  intents: readonly TIntent[]
  compile: MutationCompileDefinition<TIntent, Doc, Writer, Reader, Services, Code, Context, any>
  services: Services | undefined
  entities: ReadonlyMap<string, CompiledEntitySpec>
  ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
  tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
}): CompiledIntentProgramResult<Doc, Output, Code> => {
  const appliedSteps: MutationProgramStep[] = []
  const inverseSteps: MutationProgramStep[] = []
  const outputs: Output[] = []
  const issues: MutationCompileIssue<Code>[] = []
  const structural: MutationStructuralFact[] = []
  const footprint: MutationFootprint[] = []
  let delta = EMPTY_DELTA
  let workingDocument = input.document
  let hasTrackedHistory = false
  let skipHistory = false

  for (let index = 0; index < input.intents.length; index += 1) {
    const intent = input.intents[index]!
    const baseProgram = createMutationProgramWriter()
    const pendingIssues: MutationCompileIssue<Code>[] = []
    const pendingFootprint: MutationFootprint[] = []
    let pendingDelta = EMPTY_DELTA
    let shouldStop = false
    let blocked = false

    const handler = input.compile.handlers[intent.type as keyof typeof input.compile.handlers] as ((
      value: MutationCompileHandlerInput<Doc, TIntent, Writer, Reader, Services, Code> & Context
    ) => Output | void | MutationCompileControl<Code>)
      | undefined
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

    const createBlockedControl = (
      issue: MutationCompileIssue<Code>
    ) => {
      const normalized = normalizeCompileIssue(issue)
      pendingIssues.push(normalized)
      blocked = true
      return {
        kind: 'block' as const,
        issue: normalized
      }
    }

    const controls: MutationCompileHandlerInput<
      Doc,
      TIntent,
      Writer,
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
      reader: createMutationReader(
        input.schema,
        () => workingDocument
      ) as Reader,
      services: input.services,
      writer: createMutationWriter(
        input.schema,
        baseProgram
      ) as Writer,
      delta: (nextDelta) => {
        pendingDelta = mergeMutationDeltas(
          pendingDelta,
          normalizeMutationDelta(nextDelta)
        )
      },
      footprint: (...entries) => {
        pendingFootprint.push(...entries)
      },
      issue: (...compileIssues) => {
        compileIssues.forEach((issue) => {
          const normalized = normalizeCompileIssue(issue)
          pendingIssues.push(normalized)
          if (normalized.severity !== 'warning') {
            blocked = true
          }
        })
      },
      stop: () => {
        shouldStop = true
        return {
          kind: 'stop'
        }
      },
      invalid: (message, details, path) => createBlockedControl({
        code: 'invalid' as Code,
        message,
        details,
        ...(path === undefined ? {} : { path })
      }),
      cancelled: (message, details, path) => createBlockedControl({
        code: 'cancelled' as Code,
        message,
        details,
        ...(path === undefined ? {} : { path })
      }),
      fail: createBlockedControl
    }

    const compileInput = input.compile.createContext
      ? {
          ...controls,
          ...input.compile.createContext(controls)
        }
      : controls

    const result = handler(compileInput as MutationCompileHandlerInput<
      Doc,
      TIntent,
      Writer,
      Reader,
      Services,
      Code
    > & Context)
    if (isCompileControl(result)) {
      if (result.kind === 'stop') {
        shouldStop = true
      } else {
        blocked = true
      }
    } else if (result !== undefined) {
      outputs.push(result)
    }

    issues.push(...pendingIssues)
    if (shouldStop || blocked) {
      break
    }

    const pendingProgram = baseProgram.build()
    if (pendingProgram.steps.length === 0) {
      if (pendingDelta !== EMPTY_DELTA) {
        delta = mergeMutationDeltas(delta, pendingDelta)
      }
      if (pendingFootprint.length > 0) {
        footprint.push(...pendingFootprint)
      }
      continue
    }

    const applied = applyMutationProgram<Doc, Code>({
      document: workingDocument,
      program: pendingProgram,
      entities: input.entities,
      ordered: input.ordered,
      tree: input.tree
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
    appliedSteps.push(...applied.data.applied.steps)
    if (applied.data.inverse.steps.length > 0) {
      inverseSteps.unshift(...applied.data.inverse.steps)
    }
    delta = mergeMutationDeltas(delta, applied.data.delta)
    if (pendingDelta !== EMPTY_DELTA) {
      delta = mergeMutationDeltas(delta, pendingDelta)
    }
    structural.push(...applied.data.structural)
    footprint.push(...applied.data.footprint, ...pendingFootprint)
    issues.push(...applied.data.issues.map((issue) => ({
      code: issue.code as Code,
      message: issue.message,
      severity: issue.severity,
      ...(issue.path === undefined ? {} : { path: issue.path }),
      ...(issue.details === undefined ? {} : { details: issue.details }),
      source: {
        index,
        type: intent.type
      }
    })))
    if (applied.data.historyMode === 'track') {
      hasTrackedHistory = true
    }
    if (applied.data.historyMode === 'skip') {
      skipHistory = true
    }
  }

  return {
    document: workingDocument,
    applied: {
      steps: appliedSteps
    },
    inverse: {
      steps: inverseSteps
    },
    delta,
    structural,
    footprint: dedupeFootprints(footprint),
    outputs,
    historyMode: skipHistory
      ? 'skip'
      : hasTrackedHistory
        ? 'track'
        : 'neutral',
    ...(issues.length > 0 ? { issues } : {})
  }
}

class MutationRuntime<
  Doc extends object,
  TIntent extends MutationIntent,
  Reader,
  Services,
  Code extends string = string,
  Writer = MutationProgramWriter,
  Delta extends MutationDelta = MutationDelta,
  Context extends Record<string, unknown> = {},
  THandlers extends Record<string, (...args: any[]) => any> = Record<string, (...args: any[]) => any>
> {
  readonly history: HistoryPort<
    MutationResult<void, ApplyCommit<Doc, MutationFootprint, void, Delta>, Code>,
    MutationProgram,
    MutationFootprint,
    ApplyCommit<Doc, MutationFootprint, void, Delta>
  >

  private readonly schema: MutationSchemaDefinition<Doc>
  private readonly normalize: (doc: Doc) => Doc
  private readonly entities: ReadonlyMap<string, CompiledEntitySpec>
  private readonly ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
  private readonly tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
  private readonly services: Services | undefined
  private readonly compileDefinition?: MutationCompileDefinition<TIntent, Doc, Writer, Reader, Services, Code, Context, any>
  private readonly historyOptions?: MutationHistoryOptions | false
  private readonly historyControllerRef?: HistoryController<
    MutationProgram,
    MutationFootprint,
    ApplyCommit<Doc, MutationFootprint, void, Delta>
  >
  private readonly watchListeners = new Set<(current: MutationCurrent<Doc>) => void>()
  private readonly commitListeners = new Set<(commit: CommitRecord<Doc, MutationFootprint, void, Delta>) => void>()
  private rev = 0
  private documentState: Doc

  constructor(input: {
    schema: MutationSchemaDefinition<Doc>
    document: Doc
    normalize(doc: Doc): Doc
    services?: Services
    compile?: MutationCompileDefinition<TIntent, Doc, Writer, Reader, Services, Code, Context, any>
    history?: MutationHistoryOptions | false
  }) {
    const compiledModel = compileMutationModel(input.schema) as {
      entities: ReadonlyMap<string, CompiledEntitySpec>
      ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
      tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
    }

    this.schema = input.schema
    this.normalize = input.normalize
    this.entities = compiledModel.entities
    this.ordered = compiledModel.ordered
    this.tree = compiledModel.tree
    this.services = input.services
    this.compileDefinition = input.compile
    this.historyOptions = input.history
    this.documentState = this.normalize(input.document)

    if (input.history !== false) {
      this.historyControllerRef = historyRuntime.create<
        MutationProgram,
        MutationFootprint,
        ApplyCommit<Doc, MutationFootprint, void, Delta>
      >({
        capacity: input.history?.capacity,
        conflicts: mutationFootprintBatchConflicts
      })
    }

    this.history = createHistoryPort<
      Doc,
      MutationProgram,
      MutationFootprint,
      MutationResult<void, ApplyCommit<Doc, MutationFootprint, void, Delta>, Code>,
      ApplyCommit<Doc, MutationFootprint, void, Delta>
    >({
      apply: (program, options) => this.apply(program, options),
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
    return createMutationReader(
      this.schema,
      () => this.documentState
    ) as Reader
  }

  current(): MutationCurrent<Doc> {
    return {
      rev: this.rev,
      document: this.documentState
    }
  }

  subscribe(
    listener: (commit: MutationCommitRecord<Doc, MutationFootprint, Delta>) => void
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
  ): MutationReplaceCommit<Doc, Delta> {
    const nextDocument = this.normalize(document)
    const commit: MutationReplaceCommit<Doc, Delta> = {
      kind: 'replace',
      rev: this.rev + 1,
      at: Date.now(),
      origin: options?.origin ?? 'system',
      document: nextDocument,
      delta: createMutationDelta(this.schema, normalizeMutationDelta({
        reset: true
      })) as unknown as Delta,
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

  execute<Input extends MutationExecuteInput<TIntent>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    THandlers,
    TIntent,
    ApplyCommit<Doc, MutationFootprint, void, Delta>,
    Input,
    Code
  > {
    const intents: readonly TIntent[] = Array.isArray(input)
      ? input
      : [input]
    if (intents.length === 0) {
      return mutationFailure(
        EXECUTE_EMPTY_CODE as Code,
        'MutationEngine.execute requires at least one intent.'
      ) as MutationExecuteResultOfInput<
        THandlers,
        TIntent,
        ApplyCommit<Doc, MutationFootprint, void, Delta>,
        Input,
        Code
      >
    }

    if (!this.compileDefinition) {
      return mutationFailure(
        COMPILE_EMPTY_CODE as Code,
        'MutationEngine.execute requires compile handlers.'
      ) as MutationExecuteResultOfInput<
        THandlers,
        TIntent,
        ApplyCommit<Doc, MutationFootprint, void, Delta>,
        Input,
        Code
      >
    }

    const planned = compileMutationIntents<
      Doc,
      TIntent,
      Writer,
      Reader,
      Services,
      Code,
      Context
    >({
      schema: this.schema,
      document: this.documentState,
      intents,
      compile: this.compileDefinition,
      services: this.services,
      entities: this.entities,
      ordered: this.ordered,
      tree: this.tree
    })
    const issues = (planned.issues ?? EMPTY_COMPILE_ISSUES).map(normalizeCompileIssue)
    const canApply = (
      planned.applied.steps.length > 0
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
        THandlers,
        TIntent,
        ApplyCommit<Doc, MutationFootprint, void, Delta>,
        Input,
        Code
      >
    }

    if (planned.applied.steps.length === 0) {
      return mutationFailure(
        COMPILE_EMPTY_CODE as Code,
        'MutationEngine.execute produced no program steps.',
        {
          issues
        }
      ) as MutationExecuteResultOfInput<
        THandlers,
        TIntent,
        ApplyCommit<Doc, MutationFootprint, void, Delta>,
        Input,
        Code
      >
    }

    const committed = this.commit({
      document: planned.document,
      authored: planned.applied,
      applied: planned.applied,
      inverse: planned.inverse,
      delta: planned.delta,
      structural: planned.structural,
      footprint: planned.footprint,
      outputs: planned.outputs,
      issues,
      historyMode: planned.historyMode,
      origin: options?.origin ?? 'user',
      data: (
        Array.isArray(input)
          ? planned.outputs
          : planned.outputs[0]
      ) as MutationExecuteResultOfInput<
        THandlers,
        TIntent,
        ApplyCommit<Doc, MutationFootprint, void, Delta>,
        Input,
        Code
      > extends MutationResult<infer Data, ApplyCommit<Doc, MutationFootprint, void, Delta>, Code>
        ? Data
        : never
    })

    return committed as MutationExecuteResultOfInput<
      THandlers,
      TIntent,
      ApplyCommit<Doc, MutationFootprint, void, Delta>,
      Input,
      Code
    >
  }

  apply(
    program: MutationProgram,
    options?: MutationOptions
  ): MutationResult<
    void,
    ApplyCommit<Doc, MutationFootprint, void, Delta>,
    Code
  > {
    const applied = applyMutationProgram<Doc, Code>({
      document: this.documentState,
      program,
      entities: this.entities,
      ordered: this.ordered,
      tree: this.tree
    })
    if (!applied.ok) {
      return applied
    }

    if (applied.data.applied.steps.length === 0) {
      return mutationFailure(
        APPLY_EMPTY_CODE as Code,
        'MutationEngine.apply produced no applied steps.'
      )
    }

    return this.commit({
      document: applied.data.document,
      authored: applied.data.applied,
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
    authored: MutationProgram
    applied: MutationProgram
    inverse: MutationProgram
    delta: MutationDelta
    structural: readonly MutationStructuralFact[]
    footprint: readonly MutationFootprint[]
    outputs: readonly unknown[]
    issues: readonly MutationIssue[]
    historyMode: 'track' | 'skip' | 'neutral'
    origin: Origin
    data: TData
  }): MutationResult<
    TData,
    ApplyCommit<Doc, MutationFootprint, void, Delta>,
    Code
  > {
    const commit: ApplyCommit<Doc, MutationFootprint, void, Delta> = {
      kind: 'apply',
      rev: this.rev + 1,
      at: Date.now(),
      origin: input.origin,
      document: input.document,
      authored: input.authored,
      applied: input.applied,
      inverse: input.inverse,
      delta: createMutationDelta(this.schema, input.delta) as unknown as Delta,
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
      && commit.applied.steps.length > 0
      && commit.inverse.steps.length > 0
    ) {
      this.historyControllerRef.capture(commit)
    }

    this.emitCurrent()
    this.emitCommit(commit)
    return mutationSuccess<TData, ApplyCommit<Doc, MutationFootprint, void, Delta>, Code>(
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
    commit: CommitRecord<Doc, MutationFootprint, void, Delta>
  ): void {
    this.commitListeners.forEach((listener) => {
      listener(commit)
    })
  }
}

export class MutationEngine<
  Doc extends object,
  TIntent extends MutationIntent,
  Reader,
  Services = void,
  Code extends string = string,
  Writer = MutationProgramWriter,
  Delta extends MutationDelta = MutationDelta,
  Context extends Record<string, unknown> = {},
  THandlers extends Record<string, (...args: any[]) => any> = Record<string, (...args: any[]) => any>
> {
  private readonly runtime: MutationRuntime<Doc, TIntent, Reader, Services, Code, Writer, Delta, Context, THandlers>

  constructor(input: MutationEngineOptions<Doc, TIntent, Reader, Services, Code, Writer, Delta, Context, any>) {
    this.runtime = new MutationRuntime({
      schema: input.schema,
      document: input.document,
      normalize: input.normalize,
      services: input.services,
      compile: input.compile,
      history: input.history
    })
  }

  get history(): HistoryPort<
    MutationResult<void, ApplyCommit<Doc, MutationFootprint, void, Delta>, Code>,
    MutationProgram,
    MutationFootprint,
    ApplyCommit<Doc, MutationFootprint, void, Delta>
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

  execute<Input extends MutationExecuteInput<TIntent>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    THandlers,
    TIntent,
    ApplyCommit<Doc, MutationFootprint, void, Delta>,
    Input,
    Code
  > {
    return this.runtime.execute(input, options)
  }

  apply(
    program: MutationProgram,
    options?: MutationOptions
  ): MutationResult<
    void,
    ApplyCommit<Doc, MutationFootprint, void, Delta>,
    Code
  > {
    return this.runtime.apply(program, options)
  }

  replace(
    document: Doc,
    options?: MutationOptions
  ): MutationReplaceCommit<Doc, Delta> {
    return this.runtime.replace(document, options)
  }

  subscribe(
    listener: (commit: MutationCommitRecord<Doc, MutationFootprint, Delta>) => void
  ): () => void {
    return this.runtime.subscribe(listener)
  }

  watch(
    listener: (current: MutationCurrent<Doc>) => void
  ): () => void {
    return this.runtime.watch(listener)
  }
}
