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
  readFirstOutput,
  type MutationApplyResult,
  type MutationCompileDefinition,
  type MutationCompileIssue,
  type MutationCompileHandlerInput,
  type MutationCurrent,
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
} from './contracts'
import {
  mergeMutationDeltas,
  normalizeMutationDelta,
} from './delta'
import {
  applyMutationProgram
} from './program/apply'
import {
  isMutationProgramStep,
  type MutationProgram,
  type MutationProgramStep,
} from './program/program'
import {
  createMutationProgramWriter
} from './program/writer'
import type {
  MutationProgramWriter
} from './program/writer'
import {
  dedupeFootprints,
  mutationFootprintBatchConflicts
} from './footprint'
import type {
  CompiledEntitySpec,
  CompiledOrderedSpec,
  CompiledTreeSpec,
} from './contracts'
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
  applied: MutationProgram<string>
  inverse: MutationProgram<string>
  delta: MutationDelta
  structural: readonly MutationStructuralFact[]
  footprint: readonly MutationFootprint[]
  outputs: readonly Output[]
  issues?: readonly MutationCompileIssue<Code>[]
  historyMode: 'track' | 'skip' | 'neutral'
}

const compileMutationIntents = <
  Doc extends object,
  Table extends MutationIntentTable,
  Writer,
  Reader,
  Services,
  Context extends Record<string, unknown> = {},
  Code extends string = string
>(input: {
  document: Doc
  intents: readonly MutationIntentOf<Table>[]
  compile: MutationCompileDefinition<Table, Doc, Writer, Reader, Services, Code, Context>
  services: Services | undefined
  entities: ReadonlyMap<string, CompiledEntitySpec>
  ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
  tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
  createReader: (readDocument: () => Doc) => Reader
  createWriter: (program: MutationProgramWriter<string>) => Writer
}): CompiledIntentProgramResult<Doc, MutationOutputOf<Table>, Code> => {
  const appliedSteps: MutationProgramStep[] = []
  const inverseSteps: MutationProgramStep[] = []
  const outputs: MutationOutputOf<Table>[] = []
  const issues: MutationCompileIssue<Code>[] = []
  let delta = EMPTY_DELTA
  const structural: MutationStructuralFact[] = []
  const footprint: MutationFootprint[] = []
  let hasTrackedHistory = false
  let skipHistory = false
  let workingDocument = input.document

  for (let index = 0; index < input.intents.length; index += 1) {
    const intent = input.intents[index]!
    const pendingOutputs: MutationOutputOf<Table>[] = []
    const pendingIssues: MutationCompileIssue<Code>[] = []
    let shouldStop = false
    let blocked = false
    const baseProgram = createMutationProgramWriter<string>()

    const handler = input.compile.handlers[intent.type as MutationIntentKind<Table>]
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
      MutationIntentOf<Table>,
      Writer,
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
      reader: input.createReader(
        () => workingDocument
      ),
      services: input.services,
      writer: input.createWriter(baseProgram),
      output: (value) => {
        pendingOutputs.push(value)
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
      MutationIntentOf<Table>,
      Writer,
      MutationOutputOf<Table>,
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
    }

    issues.push(...pendingIssues)
    outputs.push(...pendingOutputs)
    if (shouldStop || blocked) {
      break
    }

    const pendingProgram = baseProgram.build()
    if (pendingProgram.steps.length === 0) {
      continue
    }

    const applied = applyMutationProgram<Doc, never, string, Code>({
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
    structural.push(...applied.data.structural)
    footprint.push(...applied.data.footprint)
    issues.push(...applied.data.issues.map((issue) => ({
      code: issue.code as Code,
      message: issue.message,
      severity: issue.severity,
      ...(issue.path === undefined
        ? {}
        : {
            path: issue.path
          }),
      ...(issue.details === undefined
        ? {}
        : {
            details: issue.details
          }),
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
  Code extends string = string,
  Writer = MutationProgramWriter<string>,
  Delta extends MutationDelta = MutationDelta,
  Context extends Record<string, unknown> = {}
> {
  readonly history: HistoryPort<
    MutationResult<void, ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>, Code>,
    MutationProgram<string>,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>
  >

  private readonly createReader: (readDocument: () => Doc) => Reader
  private readonly createDelta: (delta: MutationDelta) => Delta
  private readonly normalize: (doc: Doc) => Doc
  private readonly entities: ReadonlyMap<string, CompiledEntitySpec>
  private readonly ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
  private readonly tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
  private readonly createWriter: (program: MutationProgramWriter<string>) => Writer
  private readonly services: Services | undefined
  private readonly compileDefinition?: MutationCompileDefinition<any, Doc, Writer, Reader, Services, Code, Context>
  private readonly historyOptions?: MutationHistoryOptions | false
  private readonly historyControllerRef?: HistoryController<
    MutationProgram<string>,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>
  >
  private readonly watchListeners = new Set<(current: MutationCurrent<Doc>) => void>()
  private readonly commitListeners = new Set<(commit: CommitRecord<Doc, Op, MutationFootprint, void, Delta>) => void>()
  private rev = 0
  private documentState: Doc

  constructor(input: {
    schema: MutationSchemaDefinition<Doc>
    document: Doc
    normalize(doc: Doc): Doc
    services?: Services
    compile?: MutationCompileDefinition<any, Doc, Writer, Reader, Services, Code, Context>
    history?: MutationHistoryOptions | false
  }) {
    const compiledModel = compileMutationModel(input.schema) as {
      entities: ReadonlyMap<string, CompiledEntitySpec>
      ordered: ReadonlyMap<string, CompiledOrderedSpec<Doc>>
      tree: ReadonlyMap<string, CompiledTreeSpec<Doc>>
    }

    this.createReader = ((readDocument: () => Doc) => createMutationReader(
      input.schema,
      readDocument
    ) as Reader)
    this.createWriter = ((program) => createMutationWriter(
      input.schema,
      program
    ) as Writer)
    this.createDelta = (delta) => createMutationDelta(input.schema, delta) as unknown as Delta
    this.normalize = input.normalize
    this.entities = compiledModel.entities
    this.ordered = compiledModel.ordered as ReadonlyMap<string, CompiledOrderedSpec<Doc>>
    this.tree = compiledModel.tree as ReadonlyMap<string, CompiledTreeSpec<Doc>>
    this.services = input.services
    this.compileDefinition = input.compile
    this.historyOptions = input.history
    this.documentState = this.normalize(input.document)

    if (input.history !== false) {
      this.historyControllerRef = historyRuntime.create<
        MutationProgram<string>,
        MutationFootprint,
        ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>
      >({
        capacity: input.history?.capacity,
        conflicts: mutationFootprintBatchConflicts
      })
    }

    this.history = createHistoryPort({
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
    return this.createReader(() => this.documentState)
  }

  current(): MutationCurrent<Doc> {
    return {
      rev: this.rev,
      document: this.documentState
    }
  }

  subscribe(
    listener: (commit: MutationCommitRecord<Doc, Op, MutationFootprint, Delta>) => void
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
      delta: this.createDelta(normalizeMutationDelta({
        reset: true
      })),
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

  execute<Table extends MutationIntentTable, Input extends MutationExecuteInput<Table>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    Table,
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
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
        ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
        Input,
        Code
      >
    }

    if (!this.compileDefinition) {
      return mutationFailure(
        COMPILE_EMPTY_CODE as Code,
        'MutationEngine.execute requires compile handlers.'
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
        Input,
        Code
      >
    }

    const planned = compileMutationIntents<Doc, Table, Writer, Reader, Services, Context, Code>({
      document: this.documentState,
      intents,
      compile: this.compileDefinition as MutationCompileDefinition<Table, Doc, Writer, Reader, Services, Code, Context>,
      services: this.services,
      entities: this.entities,
      ordered: this.ordered,
      tree: this.tree,
      createReader: this.createReader,
      createWriter: this.createWriter
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
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
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
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
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
          : readFirstOutput(planned.outputs)
      ) as MutationExecuteResultOfInput<
        Table,
        ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
        Input,
        Code
      > extends MutationResult<infer Data, ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>, Code>
        ? Data
        : never
    })

    return committed as MutationExecuteResultOfInput<
      Table,
      ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
      Input,
      Code
    >
  }

  apply(
    program: MutationProgram<string>,
    options?: MutationOptions
  ): MutationResult<
    void,
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
    Code
  > {
    const applied = applyMutationProgram<Doc, Op, string, Code>({
      document: this.documentState,
      program,
      entities: this.entities,
      ordered: this.ordered,
      tree: this.tree
    })
    if (!applied.ok) {
      return applied
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
    authored: MutationProgram<string>
    applied: MutationProgram<string>
    inverse: MutationProgram<string>
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
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
    Code
  > {
    const commit: ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta> = {
      kind: 'apply',
      rev: this.rev + 1,
      at: Date.now(),
      origin: input.origin,
      document: input.document,
      authored: input.authored,
      applied: input.applied,
      inverse: input.inverse,
      delta: this.createDelta(input.delta),
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
    return mutationSuccess<TData, ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>, Code>(
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
    commit: CommitRecord<Doc, Op, MutationFootprint, void, Delta>
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
  Code extends string = string,
  Writer = MutationProgramWriter<string>,
  Delta extends MutationDelta = MutationDelta,
  Context extends Record<string, unknown> = {}
> {
  private readonly runtime: MutationRuntime<Doc, Op, Reader, Services, Code, Writer, Delta, Context>

  constructor(input: MutationEngineOptions<Doc, Table, Op, Reader, Services, Code, Writer, Delta, Context>) {
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
    MutationResult<void, ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>, Code>,
    MutationProgram<string>,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>
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
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
    K,
    Code
  >
  execute(
    intents: readonly MutationIntentOf<Table>[],
    options?: MutationOptions
  ): MutationResult<
    readonly MutationOutputOf<Table>[],
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
    Code
  >
  execute<Input extends MutationExecuteInput<Table>>(
    input: Input,
    options?: MutationOptions
  ): MutationExecuteResultOfInput<
    Table,
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
    Input,
    Code
  > {
    return this.runtime.execute<Table, Input>(input, options)
  }

  apply(
    program: MutationProgram<string>,
    options?: MutationOptions
  ): MutationResult<
    void,
    ApplyCommit<Doc, Op, MutationFootprint, void, string, Delta>,
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
    listener: (commit: MutationCommitRecord<Doc, Op, MutationFootprint, Delta>) => void
  ): () => void {
    return this.runtime.subscribe(listener)
  }

  watch(
    listener: (current: MutationCurrent<Doc>) => void
  ): () => void {
    return this.runtime.watch(listener)
  }
}
