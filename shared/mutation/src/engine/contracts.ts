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
  MutationRegistry
} from './registry'
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
  MutationModelDefinition,
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

export type MutationReaderFactory<Doc, Reader> = (
  readDocument: () => Doc,
  tools?: MutationCompileReaderTools
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
  Program,
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
  program: Program
  output(value: Output): void
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
  Program,
  Output,
  Reader,
  Services = void,
  Code extends string = string
> = (
  input: MutationCompileHandlerInput<Doc, Intent, Program, Output, Reader, Services, Code>
) => void | MutationCompileControl<Code>

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
  Op,
  Code extends string = string
> =
  | {
      ok: true
      data: {
        document: Doc
        applied: MutationProgram<string>
        inverse: MutationProgram<string>
        delta: MutationDelta
        structural: readonly MutationStructuralFact[]
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
  Program,
  Reader,
  Services = void,
  Code extends string = string
> = {
  [K in MutationIntentKind<Table>]: MutationCompileHandler<
    Doc,
    MutationIntentOf<Table, K>,
    Program,
    MutationOutputOf<Table, K>,
    Reader,
    Services,
    Code
  >
}

export type MutationCompileProgramFactory<
  Program
> = (
  program: MutationProgramWriter<string>
) => Program

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

export interface MutationStructureChangeSpec {
  key: string
  change?: MutationChangeInput
}

export interface MutationHistoryOptions {
  capacity?: number
  capture?: Partial<Record<Exclude<Origin, 'history'>, boolean>>
}

export interface MutationEngineOptions<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Reader,
  Services = void,
  Code extends string = string,
  Program = MutationProgramWriter<string>,
  Delta extends MutationDelta = MutationDelta
> {
  document: Doc
  normalize(doc: Doc): Doc
  createReader?: MutationReaderFactory<Doc, Reader>
  services?: Services
  registry?: MutationRegistry<Doc>
  model?: MutationModelDefinition<Doc>
  compile?: MutationCompileHandlerTable<Table, Doc, Program, Reader, Services, Code>
  createProgram?: MutationCompileProgramFactory<Program>
  createDelta?: (delta: MutationDelta) => Delta
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

export type MutationEntityCanonicalOperation = {
  type: string
  id?: string
  value?: unknown
  patch?: MutationEntityPatch
}

export type MutationCanonicalOperation =
  | MutationEntityCanonicalOperation

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
  Extra = void,
  Delta extends MutationDelta = MutationDelta
> = {
  apply: ApplyCommit<Doc, Op, MutationFootprint, Extra, string, Delta>
  record: CommitRecord<Doc, Op, MutationFootprint, Extra, Delta>
  stream: CommitStream<CommitRecord<Doc, Op, MutationFootprint, Extra, Delta>>
  published: MutationCommitRecord<Doc, Op, MutationFootprint, Delta>
  replace: MutationReplaceCommit<Doc, Delta>
}
