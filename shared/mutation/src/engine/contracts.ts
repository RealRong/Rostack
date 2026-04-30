import {
  equal,
  json
} from '@shared/core'
import type {
  ApplyCommit,
  CommitRecord,
  CommitStream,
  MutationChange,
  MutationChangeInput,
  MutationCommitRecord,
  MutationDelta,
  MutationDeltaInput,
  MutationFootprint,
  MutationIssue,
  MutationReplaceCommit,
  Origin,
} from '../write'
export type {
  MutationChange,
  MutationChangeInput,
  MutationDelta,
  MutationDeltaInput,
  MutationFootprint
} from '../write'

export type MutableRecordWrite = Record<string, unknown>

export type MutationReaderFactory<Doc, Reader> = (
  readDocument: () => Doc
) => Reader

export interface MutationCompileIssue<
  Code extends string = string,
  TType extends string = string
> {
  code: Code
  message: string
  path?: string
  severity?: 'error' | 'warning'
  details?: unknown
  source?: MutationCompileSource<TType>
}

export interface MutationCompileSource<
  TType extends string = string
> {
  index: number
  type: TType
}

export type MutationCompileControl<Code extends string = string> =
  | {
      kind: 'stop'
    }
  | {
      kind: 'block'
      issue: MutationCompileIssue<Code>
    }

export interface MutationCompileHandlerInput<
  Doc,
  Intent,
  Op,
  Output,
  Reader,
  Services = void,
  Code extends string = string
> {
  intent: Intent
  source: MutationCompileSource<string>
  document: Doc
  reader: Reader
  services: Services | undefined
  emit(op: Op): void
  emitMany(...ops: readonly Op[]): void
  output(value: Output): void
  issue(issue: MutationCompileIssue<Code>): void
  stop(): {
    kind: 'stop'
  }
  fail(issue: MutationCompileIssue<Code>): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
  require<T>(
    value: T | undefined,
    issue: MutationCompileIssue<Code>
  ): T | undefined
}

export type MutationCompileHandler<
  Doc,
  Intent,
  Op,
  Output,
  Reader,
  Services = void,
  Code extends string = string
> = (
  input: MutationCompileHandlerInput<Doc, Intent, Op, Output, Reader, Services, Code>
) => void | MutationCompileControl<Code>

export interface MutationCompileInput<
  Doc,
  Intent
> {
  doc: Doc
  intents: readonly Intent[]
}

export interface MutationCompileResult<
  Op,
  Output = void,
  Code extends string = string
> {
  ops: readonly Op[]
  outputs: readonly Output[]
  issues?: readonly MutationCompileIssue<Code>[]
  canApply?: boolean
}

export interface MutationError<Code extends string = string> {
  code: Code
  message: string
  details?: unknown
}

export type MutationFailure<Code extends string = string> = {
  ok: false
  error: MutationError<Code>
}

export type MutationResult<T, Commit, Code extends string = string> =
  | {
      ok: true
      data: T
      commit: Commit
    }
  | MutationFailure<Code>

export type MutationApplyResult<
  Doc,
  Op,
  Code extends string = string
> =
  | {
      ok: true
      data: {
        document: Doc
        forward: readonly Op[]
        inverse: readonly Op[]
        delta: MutationDelta
        footprint: readonly MutationFootprint[]
        outputs: readonly unknown[]
        issues: readonly MutationIssue[]
        historyMode: 'track' | 'skip' | 'neutral'
      }
    }
  | MutationFailure<Code>

export interface MutationIntentTable {
  [kind: string]: {
    intent: {
      type: string
    }
    output: unknown
  }
}

type MutationIntentTableKey<T extends MutationIntentTable> = ({
  [K in keyof T]: string extends K
    ? never
    : number extends K
      ? never
      : symbol extends K
        ? never
        : K
})[keyof T] & string

export type MutationIntentKind<T extends MutationIntentTable> =
  MutationIntentTableKey<T>

export type MutationIntentOf<
  T extends MutationIntentTable,
  K extends MutationIntentKind<T> = MutationIntentKind<T>
> = T[K]['intent']

export type MutationOutputOf<
  T extends MutationIntentTable,
  K extends MutationIntentKind<T> = MutationIntentKind<T>
> = T[K]['output']

export type MutationCompileHandlerTable<
  Table extends MutationIntentTable,
  Doc,
  Op,
  Reader,
  Services = void,
  Code extends string = string
> = {
  [K in MutationIntentKind<Table>]: MutationCompileHandler<
    Doc,
    MutationIntentOf<Table, K>,
    Op,
    MutationOutputOf<Table, K>,
    Reader,
    Services,
    Code
  >
}

export type MutationExecuteResult<
  T extends MutationIntentTable,
  W,
  K extends MutationIntentKind<T>,
  Code extends string = string
> = MutationResult<MutationOutputOf<T, K>, W, Code>

export type MutationExecuteInput<T extends MutationIntentTable> =
  | MutationIntentOf<T>
  | readonly MutationIntentOf<T>[]

export type MutationExecuteResultOfInput<
  T extends MutationIntentTable,
  W,
  Input extends MutationExecuteInput<T>,
  Code extends string = string
> = Input extends readonly MutationIntentOf<T>[]
  ? MutationResult<readonly MutationOutputOf<T>[], W, Code>
  : Input extends MutationIntentOf<T, infer K>
    ? MutationExecuteResult<T, W, K, Code>
    : never

export interface MutationOptions {
  origin?: Origin
}

export type MutationEntityPatch = Readonly<Record<string, unknown>>

export interface MutationEntitySpec {
  kind: 'table' | 'map' | 'singleton'
  members: Readonly<Record<string, 'field' | 'record'>>
  change?: Readonly<Record<string, readonly string[]>>
}

export interface MutationHistoryOptions {
  capacity?: number
  capture?: Partial<Record<Exclude<Origin, 'history'>, boolean>>
}

export interface MutationCustomFailure<
  Code extends string = string
> {
  code: Code
  message: string
  details?: unknown
  path?: string
}

export interface MutationCustomReduceInput<
  Doc,
  Op,
  Reader,
  Services = void,
  Code extends string = string
> {
  op: Op
  document: Doc
  reader: Reader
  origin: Origin
  services: Services | undefined
  fail(issue: MutationCustomFailure<Code>): never
}

export interface MutationCustomHistoryResult<Op> {
  forward?: readonly Op[]
  inverse: readonly Op[]
}

export interface MutationCustomReduceResult<
  Doc,
  Op
> {
  document?: Doc
  delta?: MutationDeltaInput
  footprint?: readonly MutationFootprint[]
  history?: false | MutationCustomHistoryResult<Op>
  outputs?: readonly unknown[]
  issues?: readonly MutationIssue[]
}

export interface MutationCustomSpec<
  Doc,
  CurrentOp,
  Op = CurrentOp,
  Reader = unknown,
  Services = void,
  Code extends string = string
> {
  reduce(
    input: MutationCustomReduceInput<Doc, CurrentOp, Reader, Services, Code>
  ): MutationCustomReduceResult<Doc, Op> | void
}

export type MutationCustomTable<
  Doc,
  Op extends {
    type: string
  },
  Reader,
  Services = void,
  Code extends string = string
> = Partial<{
  readonly [TType in Op['type']]: MutationCustomSpec<
    Doc,
    Extract<Op, { type: TType }>,
    Op,
    Reader,
    Services,
    Code
  >
}> & Readonly<Record<string, MutationCustomSpec<Doc, Op, Op, Reader, Services, Code>>>

export interface MutationEngineOptions<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Reader,
  Services = void,
  Code extends string = string
> {
  document: Doc
  normalize(doc: Doc): Doc
  createReader: MutationReaderFactory<Doc, Reader>
  services?: Services
  entities?: Readonly<Record<string, MutationEntitySpec>>
  custom?: MutationCustomTable<Doc, Op, Reader, Services, Code>
  compile?: MutationCompileHandlerTable<Table, Doc, Op, Reader, Services, Code>
  history?: MutationHistoryOptions | false
}

export type MutationCurrent<Doc> = {
  rev: number
  document: Doc
}

export type MutationOperationKind =
  | 'create'
  | 'patch'
  | 'delete'

export type MutationCanonicalOperation = {
  type: string
  id?: string
  value?: unknown
  patch?: MutationEntityPatch
}

export type CompiledMemberSpec = {
  name: string
  kind: 'field' | 'record'
}

export type CompiledPathSelector = {
  member: string
  segments: readonly string[]
}

export type CompiledChangeRule = {
  key: string
  selectors: readonly CompiledPathSelector[]
}

export type CompiledEntitySpec = {
  family: string
  kind: 'table' | 'map' | 'singleton'
  rootKey: string
  members: ReadonlyMap<string, CompiledMemberSpec>
  changeRules: readonly CompiledChangeRule[]
  createType: string
  patchType: string
  deleteType: string
}

export type DeltaAccumulatorEntry = {
  full: boolean
  ids: Set<string> | 'all'
  pathsAll: boolean
  paths: Map<string, Set<string> | 'all'>
  order: boolean
  extra: Record<string, unknown>
}

export type CompileLoopResult<
  Doc,
  Op,
  Output,
  Code extends string = string
> = MutationCompileResult<Op, Output, Code>

export interface MutationEntityEffectInput {
  family: string
  created?: readonly string[]
  deleted?: readonly string[]
  touched?: readonly string[]
}

export const COMPILE_BLOCKED_CODE = 'mutation_engine.compile.blocked'
export const COMPILE_EMPTY_CODE = 'mutation_engine.compile.empty'
export const COMPILE_APPLY_FAILED_CODE = 'mutation_engine.compile.apply_failed'
export const APPLY_EMPTY_CODE = 'mutation_engine.apply.empty'
export const EXECUTE_EMPTY_CODE = 'mutation_engine.execute.empty'

export const EMPTY_MUTATION_CHANGES = Object.freeze(
  Object.create(null)
) as MutationDelta['changes']

export const EMPTY_DELTA: MutationDelta = {
  changes: EMPTY_MUTATION_CHANGES
}
export const EMPTY_ISSUES: readonly MutationIssue[] = []
export const EMPTY_COMPILE_ISSUES: readonly MutationCompileIssue[] = []
export const EMPTY_OUTPUTS: readonly unknown[] = []
export const DOCUMENT_FAMILY = 'document'

export const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

export const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

export const cloneValue = <T,>(
  value: T
): T => value === undefined
  ? value
  : json.clone(value)

export const sameJsonValue = (
  left: unknown,
  right: unknown
): boolean => equal.sameJsonValue(left, right)

export const normalizeCompileIssue = <Code extends string>(
  issue: MutationCompileIssue<Code>
): Required<Pick<MutationCompileIssue<Code>, 'code' | 'message' | 'severity'>> & Omit<
  MutationCompileIssue<Code>,
  'severity'
> => ({
  ...issue,
  severity: issue.severity ?? 'error'
})

export const hasCompileErrors = (
  issues: readonly MutationCompileIssue[]
): boolean => issues.some((issue) => (issue.severity ?? 'error') === 'error')

export const isCompileControl = <Code extends string>(
  value: unknown
): value is MutationCompileControl<Code> => (
  typeof value === 'object'
  && value !== null
  && 'kind' in value
  && (
    value.kind === 'stop'
    || value.kind === 'block'
  )
)

export const isMutationChangeObject = (
  change: MutationChangeInput
): change is Exclude<MutationChangeInput, true | readonly string[]> => (
  change !== true
  && !Array.isArray(change)
)

export const mutationFailure = <Code extends string>(
  code: Code,
  message: string,
  details?: unknown
): MutationFailure<Code> => ({
  ok: false,
  error: {
    code,
    message,
    ...(details === undefined
      ? {}
      : {
          details
        })
  }
})

export class MutationCustomReduceError<
  Code extends string = string
> extends Error {
  readonly issue: MutationCustomFailure<Code>

  constructor(issue: MutationCustomFailure<Code>) {
    super(issue.message)
    this.issue = issue
  }
}

export const mutationSuccess = <T, Commit, Code extends string = string>(
  data: T,
  commit: Commit
): MutationResult<T, Commit, Code> => ({
  ok: true,
  data,
  commit
})

export const readFirstOutput = <Output>(
  outputs: readonly Output[]
): Output | undefined => outputs[0]

export const pluralizeFamily = (
  family: string
): string => family.endsWith('y')
  ? `${family.slice(0, -1)}ies`
  : `${family}s`

export const appendPath = (
  base: string,
  next: string
): string => base
  ? `${base}.${next}`
  : next

export const toSortedArray = (
  values: ReadonlySet<string>
): readonly string[] => [...values].sort()

export const readFamilyFromKey = (
  key: string
): string | undefined => {
  const index = key.indexOf('.')
  return index < 0
    ? undefined
    : key.slice(0, index)
}

export const endsWithOperationKey = (
  key: string,
  operation: MutationOperationKind
): boolean => key.endsWith(`.${operation}`)

export const readChangeEntries = (
  source: {
    changes: Readonly<Record<string, MutationChangeInput | MutationChange>>
  }
): readonly (readonly [string, MutationChangeInput])[] => Object.entries(
  source.changes
) as readonly (readonly [string, MutationChangeInput])[]

export type MutationCommitTypes<
  Doc,
  Op,
  Extra = void
> = {
  apply: ApplyCommit<Doc, Op, MutationFootprint, Extra>
  record: CommitRecord<Doc, Op, MutationFootprint, Extra>
  stream: CommitStream<CommitRecord<Doc, Op, MutationFootprint, Extra>>
  published: MutationCommitRecord<Doc, Op, MutationFootprint>
  replace: MutationReplaceCommit<Doc>
}
