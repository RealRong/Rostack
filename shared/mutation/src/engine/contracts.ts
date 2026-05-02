import {
  equal,
  json
} from '@shared/core'
import type {
  MutationProgramWriter
} from './program/writer'
import type {
  MutationProgram
} from './program/program'
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
  MutationOrderedAnchor,
  MutationReplaceCommit,
  MutationStructuralFact,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
  Origin,
} from '../write'
import type {
  MutationSchemaDefinition,
} from '../model'
export type {
  MutationChange,
  MutationChangeInput,
  MutationDelta,
  MutationDeltaInput,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationOrderedSlot,
  MutationStructuralFact,
  MutationTreeNodeSnapshot,
  MutationTreeSnapshot,
  MutationTreeSubtreeSnapshot,
} from '../write'

export type MutableRecordWrite = Record<string, unknown>

export interface MutationCompileReaderTools<
  Code extends string = string
> {
  source: MutationCompileSource<string>
  issue(...issues: readonly MutationCompileIssue<Code>[]): void
  invalid(
    message: string,
    details?: unknown,
    path?: string
  ): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
  cancelled(
    message: string,
    details?: unknown,
    path?: string
  ): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
  fail(
    issue: MutationCompileIssue<Code>
  ): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
}

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
  Writer,
  Reader,
  Services = void,
  Code extends string = string
> {
  intent: Intent
  source: MutationCompileSource<string>
  document: Doc
  reader: Reader
  services: Services | undefined
  writer: Writer
  delta(delta: MutationDeltaInput): void
  footprint(...entries: MutationFootprint[]): void
  issue(...issues: readonly MutationCompileIssue<Code>[]): void
  stop(): {
    kind: 'stop'
  }
  invalid(
    message: string,
    details?: unknown,
    path?: string
  ): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
  cancelled(
    message: string,
    details?: unknown,
    path?: string
  ): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
  fail(issue: MutationCompileIssue<Code>): {
    kind: 'block'
    issue: MutationCompileIssue<Code>
  }
}

export type MutationCompileHandler<
  Doc,
  Intent,
  Writer,
  Reader,
  Services = void,
  Code extends string = string,
  Output = unknown
> = (
  input: MutationCompileHandlerInput<Doc, Intent, Writer, Reader, Services, Code>
) => Output | void | MutationCompileControl<Code>

export type MutationCompileHandlerContext<
  Doc,
  Intent,
  Writer,
  Reader,
  Services = void,
  Code extends string = string
> = Record<string, unknown> & Partial<MutationCompileHandlerInput<
  Doc,
  Intent,
  Writer,
  Reader,
  Services,
  Code
>>

export interface MutationCompileInput<
  Doc,
  Intent
> {
  doc: Doc
  intents: readonly Intent[]
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
  Code extends string = string
> =
  | {
      ok: true
      data: {
        document: Doc
        applied: MutationProgram
        inverse: MutationProgram
        delta: MutationDelta
        structural: readonly MutationStructuralFact[]
        footprint: readonly MutationFootprint[]
        outputs: readonly unknown[]
        issues: readonly MutationIssue[]
        historyMode: 'track' | 'skip' | 'neutral'
      }
    }
  | MutationFailure<Code>

export type MutationIntent = {
  type: string
}

type MutationIntentType<
  TIntent extends MutationIntent
> = TIntent['type'] & string

type MutationIntentByType<
  TIntent extends MutationIntent,
  K extends MutationIntentType<TIntent>
> = Extract<TIntent, {
  type: K
}>

export type MutationCompileHandlerTable<
  Doc,
  TIntent extends MutationIntent,
  Writer,
  Reader,
  Services = void,
  Code extends string = string,
  Context extends MutationCompileHandlerContext<
    Doc,
    TIntent,
    Writer,
    Reader,
    Services,
    Code
  > = {}
> = {
  [K in MutationIntentType<TIntent>]: ((
    input: MutationCompileHandlerInput<
      Doc,
      MutationIntentByType<TIntent, K>,
      Writer,
      Reader,
      Services,
      Code
    > & Context
  ) => unknown | void | MutationCompileControl<Code>)
}

export type MutationCompileHandlerOutput<
  THandler
> = Exclude<
  THandler extends (...args: any[]) => infer TResult
    ? TResult
    : never,
  void | MutationCompileControl<any>
>

type MutationOutputByIntent<
  THandlers,
  TIntent extends MutationIntent
> = TIntent extends {
  type: infer K extends keyof THandlers & string
}
  ? MutationCompileHandlerOutput<THandlers[K]>
  : never

export interface MutationCompileDefinition<
  TIntent extends MutationIntent,
  Doc,
  Writer,
  Reader,
  Services = void,
  Code extends string = string,
  Context extends MutationCompileHandlerContext<
    Doc,
    TIntent,
    Writer,
    Reader,
    Services,
    Code
  > = {},
  THandlers extends MutationCompileHandlerTable<
    Doc,
    TIntent,
    Writer,
    Reader,
    Services,
    Code,
    Context
  > = MutationCompileHandlerTable<
    Doc,
    TIntent,
    Writer,
    Reader,
    Services,
    Code,
    Context
  >
> {
  createContext?: (
    input: MutationCompileHandlerInput<
      Doc,
      TIntent,
      Writer,
      Reader,
      Services,
      Code
    >
  ) => Context
  handlers: THandlers
}

export type MutationExecuteResult<
  TOutput,
  W,
  Code extends string = string
> = MutationResult<TOutput, W, Code>

export type MutationExecuteInput<TIntent extends MutationIntent> =
  | TIntent
  | readonly TIntent[]

export type MutationExecuteResultOfInput<
  THandlers,
  TIntent extends MutationIntent,
  W,
  Input,
  Code extends string = string
> = Input extends readonly TIntent[]
  ? MutationResult<{
      [K in keyof Input]: Input[K] extends {
        type: string
      }
        ? MutationOutputByIntent<THandlers, Input[K]>
        : never
    }, W, Code>
  : Input extends {
      type: string
    }
    ? MutationExecuteResult<MutationOutputByIntent<THandlers, Input>, W, Code>
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

export interface MutationStructureChangeSpec {
  key: string
  change?: MutationChangeInput
}

export interface CompiledOrderedSpec<
  Doc,
  Item = unknown,
  Patch = unknown
> {
  type: string
  read(document: Doc, key: string | undefined): readonly Item[]
  write(document: Doc, key: string | undefined, items: readonly Item[]): Doc
  identify(item: Item): string
  clone?(item: Item): Item
  patch?(item: Item, patch: Patch): Item
  diff?(before: Item, after: Item): Patch
  change?: readonly MutationStructureChangeSpec[] | ((
    key: string | undefined
  ) => readonly MutationStructureChangeSpec[] | undefined)
}

export interface CompiledTreeSpec<
  Doc,
  Value = unknown,
  Patch = unknown
> {
  type: string
  read(document: Doc, key: string | undefined): MutationTreeSnapshot<Value>
  write(document: Doc, key: string | undefined, tree: MutationTreeSnapshot<Value>): Doc
  clone?(value: Value): Value
  patch?(value: Value, patch: Patch): Value
  diff?(before: Value, after: Value): Patch
  change?: readonly MutationStructureChangeSpec[] | ((
    key: string | undefined
  ) => readonly MutationStructureChangeSpec[] | undefined)
}

export interface MutationHistoryOptions {
  capacity?: number
  capture?: Partial<Record<Exclude<Origin, 'history'>, boolean>>
}

export interface MutationEngineOptions<
  Doc extends object,
  TIntent extends MutationIntent,
  Reader,
  Services = void,
  Code extends string = string,
  Writer = MutationProgramWriter,
  Delta extends MutationDelta = MutationDelta,
  Context extends MutationCompileHandlerContext<
    Doc,
    TIntent,
    Writer,
    Reader,
    Services,
    Code
  > = {},
  THandlers extends MutationCompileHandlerTable<
    Doc,
    TIntent,
    Writer,
    Reader,
    Services,
    Code,
    Context
  > = MutationCompileHandlerTable<
    Doc,
    TIntent,
    Writer,
    Reader,
    Services,
    Code,
    Context
  >
> {
  schema: MutationSchemaDefinition<Doc>
  document: Doc
  normalize(doc: Doc): Doc
  services?: Services
  compile?: MutationCompileDefinition<TIntent, Doc, Writer, Reader, Services, Code, Context, THandlers>
  history?: MutationHistoryOptions | false
}

export type MutationCurrent<Doc> = {
  rev: number
  document: Doc
}

export type MutationEntityChangeKind =
  | 'create'
  | 'patch'
  | 'delete'

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
  access?: {
    read(document: unknown): unknown
    write(document: unknown, next: unknown): unknown
  }
}

export type DeltaAccumulatorEntry = {
  full: boolean
  ids: Set<string> | 'all'
  pathsAll: boolean
  paths: Map<string, Set<string> | 'all'>
  order: boolean
  extra: Record<string, unknown>
}

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

export const EMPTY_MUTATION_IDS = Object.freeze(
  new Set<string>()
) as ReadonlySet<string>

export const EMPTY_DELTA: MutationDelta = {
  changes: EMPTY_MUTATION_CHANGES,
  has: () => false,
  changed: () => false,
  ids: () => EMPTY_MUTATION_IDS,
  paths: () => undefined
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
  operation: MutationEntityChangeKind
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
  Extra = void,
  Delta extends MutationDelta = MutationDelta
> = {
  apply: ApplyCommit<Doc, MutationFootprint, Extra, Delta>
  record: CommitRecord<Doc, MutationFootprint, Extra, Delta>
  stream: CommitStream<CommitRecord<Doc, MutationFootprint, Extra, Delta>>
  published: MutationCommitRecord<Doc, MutationFootprint, Delta>
  replace: MutationReplaceCommit<Doc, Delta>
}
