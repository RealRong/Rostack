import {
  json
} from '@shared/core'
import {
  draft,
  type RecordWrite
} from '@shared/draft'
import {
  history as historyRuntime,
  type HistoryController
} from './history'
import {
  createHistoryPort,
  type HistoryPort
} from './localHistory'
import type {
  ApplyCommit,
  CommitRecord,
  CommitStream,
  MutationChange,
  MutationCommitRecord,
  MutationDelta,
  MutationDeltaInput,
  MutationFootprint,
  MutationIssue,
  MutationReplaceCommit,
  Origin,
} from './write'

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
  Services = void,
  Code extends string = string
> {
  intent: Intent
  document: Doc
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
  Services = void,
  Code extends string = string
> = (
  input: MutationCompileHandlerInput<Doc, Intent, Op, Output, Services, Code>
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
  Services = void,
  Code extends string = string
> = {
  [K in MutationIntentKind<Table>]: MutationCompileHandler<
    Doc,
    MutationIntentOf<Table, K>,
    Op,
    MutationOutputOf<Table, K>,
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
  kind: 'table' | 'singleton'
  members: Readonly<Record<string, 'field' | 'record'>>
  change?: Readonly<Record<string, readonly string[]>>
    | ((input: {
        entity: {
          id?: string
        }
        operation: {
          type: string
        }
        before?: unknown
        after?: unknown
        changed: readonly string[]
      }) => {
        changes?: MutationDeltaInput['changes']
      } | void)
}

type MutationEntityChangeFn = Extract<
  MutationEntitySpec['change'],
  (...args: never[]) => unknown
>

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
  Services = void,
  Code extends string = string
> {
  op: Op
  document: Doc
  services: Services | undefined
  read<T>(reader: (document: Doc) => T): T
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
  Op,
  Services = void,
  Code extends string = string
> {
  reduce(
    input: MutationCustomReduceInput<Doc, Op, Services, Code>
  ): MutationCustomReduceResult<Doc, Op> | void
}

export type MutationCustomTable<
  Doc,
  Op,
  Services = void,
  Code extends string = string
> = Readonly<Record<string, MutationCustomSpec<Doc, Op, Services, Code>>>

export interface MutationEngineOptions<
  Doc extends object,
  Table extends MutationIntentTable,
  Op extends {
    type: string
  },
  Services = void,
  Code extends string = string
> {
  document: Doc
  normalize(doc: Doc): Doc
  services?: Services
  entities: Readonly<Record<string, MutationEntitySpec>>
  custom?: MutationCustomTable<Doc, Op, Services, Code>
  compile?: MutationCompileHandlerTable<Table, Doc, Op, Services, Code>
  history?: MutationHistoryOptions | false
}

export type MutationCurrent<Doc> = {
  rev: number
  document: Doc
}

type MutationOperationKind =
  | 'create'
  | 'patch'
  | 'delete'

type MutationCanonicalOperation = {
  type: string
  id?: string
  value?: unknown
  patch?: MutationEntityPatch
}

type CompiledMemberSpec = {
  name: string
  kind: 'field' | 'record'
}

type CompiledPathSelector = {
  member: string
  segments: readonly string[]
}

type CompiledChangeRule = {
  key: string
  selectors: readonly CompiledPathSelector[]
}

type CompiledEntitySpec = {
  family: string
  kind: 'table' | 'singleton'
  rootKey: string
  members: ReadonlyMap<string, CompiledMemberSpec>
  changeRules: readonly CompiledChangeRule[]
  changeFn?: MutationEntityChangeFn
  createType: string
  patchType: string
  deleteType: string
}

type DeltaAccumulatorEntry = {
  full: boolean
  ids: Set<string> | 'all'
  paths: Map<string, Set<string> | 'all'>
  order: boolean
  extra: Record<string, unknown>
}

type CompileLoopResult<
  Doc,
  Op,
  Output,
  Code extends string = string
> = MutationCompileResult<Op, Output, Code>

const COMPILE_BLOCKED_CODE = 'mutation_engine.compile.blocked'
const COMPILE_EMPTY_CODE = 'mutation_engine.compile.empty'
const COMPILE_APPLY_FAILED_CODE = 'mutation_engine.compile.apply_failed'
const APPLY_EMPTY_CODE = 'mutation_engine.apply.empty'
const EXECUTE_EMPTY_CODE = 'mutation_engine.execute.empty'

const EMPTY_DELTA: MutationDelta = {}
const EMPTY_ISSUES: readonly MutationIssue[] = []
const EMPTY_COMPILE_ISSUES: readonly MutationCompileIssue[] = []
const EMPTY_OUTPUTS: readonly unknown[] = []
const DOCUMENT_FAMILY = 'document'

const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const isObjectRecord = (
  value: unknown
): value is Record<string, unknown> => (
  typeof value === 'object'
  && value !== null
  && !Array.isArray(value)
)

const cloneValue = <T,>(
  value: T
): T => value === undefined
  ? value
  : json.clone(value)

const normalizeCompileIssue = <Code extends string>(
  issue: MutationCompileIssue<Code>
): Required<Pick<MutationCompileIssue<Code>, 'code' | 'message' | 'severity'>> & Omit<
  MutationCompileIssue<Code>,
  'severity'
> => ({
  ...issue,
  severity: issue.severity ?? 'error'
})

const hasCompileErrors = (
  issues: readonly MutationCompileIssue[]
): boolean => issues.some((issue) => (issue.severity ?? 'error') === 'error')

const isCompileControl = <Code extends string>(
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

const isMutationChangeObject = (
  change: MutationChange
): change is Exclude<MutationChange, true | readonly string[]> => (
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

class MutationCustomReduceError<
  Code extends string = string
> extends Error {
  readonly issue: MutationCustomFailure<Code>

  constructor(issue: MutationCustomFailure<Code>) {
    super(issue.message)
    this.issue = issue
  }
}

const mutationSuccess = <T, Commit, Code extends string = string>(
  data: T,
  commit: Commit
): MutationResult<T, Commit, Code> => ({
  ok: true,
  data,
  commit
})

const readFirstOutput = <Output>(
  outputs: readonly Output[]
): Output | undefined => outputs[0]

const pluralizeFamily = (
  family: string
): string => family.endsWith('y')
  ? `${family.slice(0, -1)}ies`
  : `${family}s`

const appendPath = (
  base: string,
  next: string
): string => base
  ? `${base}.${next}`
  : next

const toSortedArray = (
  values: ReadonlySet<string>
): readonly string[] => [...values].sort()

const readFamilyFromKey = (
  key: string
): string | undefined => {
  const index = key.indexOf('.')
  return index < 0
    ? undefined
    : key.slice(0, index)
}

const endsWithOperationKey = (
  key: string,
  operation: MutationOperationKind
): boolean => key.endsWith(`.${operation}`)

const collectRecordLeafPaths = (
  value: unknown,
  basePath: string,
  target: Set<string>
): void => {
  target.add(basePath)

  if (!isObjectRecord(value)) {
    return
  }

  const keys = Object.keys(value)
  if (keys.length === 0) {
    return
  }

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!
    collectRecordLeafPaths(
      value[key],
      appendPath(basePath, key),
      target
    )
  }
}

const collectRecordPatchWrites = (
  value: unknown,
  basePath: string,
  target: Record<string, unknown>
): void => {
  if (!isObjectRecord(value)) {
    target[basePath] = cloneValue(value)
    return
  }

  const keys = Object.keys(value)
  if (keys.length === 0) {
    return
  }

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]!
    collectRecordPatchWrites(
      value[key],
      appendPath(basePath, key),
      target
    )
  }
}

const setNestedPatchValue = (
  target: Record<string, unknown>,
  path: readonly string[],
  value: unknown
): void => {
  const [head, ...rest] = path
  if (!head) {
    return
  }

  if (rest.length === 0) {
    target[head] = cloneValue(value)
    return
  }

  const current = target[head]
  const next = isObjectRecord(current)
    ? current
    : {}
  target[head] = next
  setNestedPatchValue(next, rest, value)
}

const compilePathSelector = (
  members: ReadonlyMap<string, CompiledMemberSpec>,
  raw: string
): CompiledPathSelector => {
  const parts = raw.split('.').filter(Boolean)
  const [member, ...segments] = parts
  if (!member) {
    throw new Error('Mutation entity change selector cannot be empty.')
  }

  const compiledMember = members.get(member)
  if (!compiledMember) {
    throw new Error(`Unknown mutation entity member "${member}" in selector "${raw}".`)
  }

  if (compiledMember.kind === 'field' && segments.length > 0) {
    throw new Error(`Field member "${member}" only accepts exact selector "${member}".`)
  }

  const recursiveIndex = segments.indexOf('**')
  if (recursiveIndex >= 0 && recursiveIndex !== segments.length - 1) {
    throw new Error(`Selector "${raw}" only allows "**" at the end.`)
  }

  return {
    member,
    segments
  }
}

const selectorOverlapsConcretePath = (
  selector: CompiledPathSelector,
  concretePath: string
): boolean => {
  const concreteParts = concretePath.split('.').filter(Boolean)
  const [member, ...segments] = concreteParts
  if (selector.member !== member) {
    return false
  }

  let selectorIndex = 0
  let concreteIndex = 0

  while (
    selectorIndex < selector.segments.length
    && concreteIndex < segments.length
  ) {
    const selectorSegment = selector.segments[selectorIndex]!
    if (selectorSegment === '**') {
      return true
    }

    if (
      selectorSegment !== '*'
      && selectorSegment !== segments[concreteIndex]
    ) {
      return false
    }

    selectorIndex += 1
    concreteIndex += 1
  }

  if (selectorIndex < selector.segments.length && selector.segments[selectorIndex] === '**') {
    return true
  }

  return true
}

const readMatchedRulePaths = (
  rule: CompiledChangeRule,
  changedPaths: readonly string[]
): readonly string[] => {
  const matched = new Set<string>()

  for (let pathIndex = 0; pathIndex < changedPaths.length; pathIndex += 1) {
    const path = changedPaths[pathIndex]!
    for (let selectorIndex = 0; selectorIndex < rule.selectors.length; selectorIndex += 1) {
      const selector = rule.selectors[selectorIndex]!
      if (selectorOverlapsConcretePath(selector, path)) {
        matched.add(path)
        break
      }
    }
  }

  return [...matched]
}

const compileEntitySpec = (
  family: string,
  spec: MutationEntitySpec
): CompiledEntitySpec => {
  const members = new Map<string, CompiledMemberSpec>()
  const memberEntries = Object.entries(spec.members)

  for (let index = 0; index < memberEntries.length; index += 1) {
    const [name, kind] = memberEntries[index]!
    members.set(name, {
      name,
      kind
    })
  }

  const changeRules: CompiledChangeRule[] = []
  if (spec.change && typeof spec.change !== 'function') {
    const entries = Object.entries(spec.change)
    for (let index = 0; index < entries.length; index += 1) {
      const [key, selectors] = entries[index]!
      changeRules.push({
        key,
        selectors: selectors.map((selector) => compilePathSelector(members, selector))
      })
    }
  }

  return {
    family,
    kind: spec.kind,
    rootKey: spec.kind === 'table'
      ? pluralizeFamily(family)
      : family === DOCUMENT_FAMILY
        ? ''
        : family,
    members,
    changeRules,
    changeFn: typeof spec.change === 'function'
      ? spec.change
      : undefined,
    createType: `${family}.create`,
    patchType: `${family}.patch`,
    deleteType: `${family}.delete`
  }
}

const compileEntities = (
  entities: Readonly<Record<string, MutationEntitySpec>>
): ReadonlyMap<string, CompiledEntitySpec> => {
  const compiled = new Map<string, CompiledEntitySpec>()
  const entries = Object.entries(entities)

  for (let index = 0; index < entries.length; index += 1) {
    const [family, spec] = entries[index]!
    compiled.set(family, compileEntitySpec(family, spec))
  }

  return compiled
}

const readCanonicalOperation = (
  type: string
): { family: string; kind: MutationOperationKind } | undefined => {
  if (type.endsWith('.create')) {
    return {
      family: type.slice(0, -'.create'.length),
      kind: 'create'
    }
  }

  if (type.endsWith('.patch')) {
    return {
      family: type.slice(0, -'.patch'.length),
      kind: 'patch'
    }
  }

  if (type.endsWith('.delete')) {
    return {
      family: type.slice(0, -'.delete'.length),
      kind: 'delete'
    }
  }

  return undefined
}

const readRequiredId = (
  family: string,
  op: MutationCanonicalOperation
): string => {
  if (typeof op.id !== 'string' || op.id.length === 0) {
    throw new Error(`Mutation operation "${family}" requires a non-empty id.`)
  }

  return op.id
}

const readRequiredValue = (
  family: string,
  kind: MutationOperationKind,
  op: MutationCanonicalOperation
): unknown => {
  if (!hasOwn(op, 'value')) {
    throw new Error(`Mutation operation "${family}.${kind}" requires a value.`)
  }

  return op.value
}

const readRequiredPatch = (
  family: string,
  op: MutationCanonicalOperation
): MutationEntityPatch => {
  if (!isObjectRecord(op.patch)) {
    throw new Error(`Mutation operation "${family}.patch" requires an object patch.`)
  }

  return op.patch
}

const readEntityIdFromValue = (
  family: string,
  value: unknown
): string => {
  if (!isObjectRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error(`Mutation operation "${family}.create" requires value.id.`)
  }

  return value.id
}

const compileEntityPatchWrites = (
  spec: CompiledEntitySpec,
  patch: MutationEntityPatch
): RecordWrite => {
  const writes: Record<string, unknown> = {}
  const entries = Object.entries(patch)

  for (let index = 0; index < entries.length; index += 1) {
    const [memberName, value] = entries[index]!
    const member = spec.members.get(memberName)
    if (!member) {
      throw new Error(`Unknown mutation patch member "${memberName}" on "${spec.family}".`)
    }

    if (member.kind === 'field') {
      writes[memberName] = cloneValue(value)
      continue
    }

    collectRecordPatchWrites(value, memberName, writes)
  }

  return Object.freeze(writes)
}

const readChangedPathsFromWrites = (
  writes: RecordWrite
): readonly string[] => Object.keys(writes).sort()

const readEntitySnapshotPaths = (
  spec: CompiledEntitySpec,
  entity: unknown
): readonly string[] => {
  if (!isObjectRecord(entity)) {
    return []
  }

  const paths = new Set<string>()
  const members = [...spec.members.values()]
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!
    if (!hasOwn(entity, member.name)) {
      continue
    }

    if (member.kind === 'field') {
      paths.add(member.name)
      continue
    }

    collectRecordLeafPaths(entity[member.name], member.name, paths)
  }

  return [...paths].sort()
}

const createPatchFromWrites = (
  writes: RecordWrite
): MutationEntityPatch => {
  const patch: Record<string, unknown> = {}
  const entries = Object.entries(writes)

  for (let index = 0; index < entries.length; index += 1) {
    const [path, value] = entries[index]!
    setNestedPatchValue(patch, path.split('.').filter(Boolean), value)
  }

  return patch
}

const prefixRecordWrites = (
  basePath: string,
  writes: RecordWrite
): RecordWrite => {
  if (!basePath) {
    return writes
  }

  const prefixed: Record<string, unknown> = {}
  const entries = Object.entries(writes)

  for (let index = 0; index < entries.length; index += 1) {
    const [path, value] = entries[index]!
    prefixed[appendPath(basePath, path)] = cloneValue(value)
  }

  return Object.freeze(prefixed)
}

const addIdsToChange = (
  entry: DeltaAccumulatorEntry,
  ids: readonly string[] | 'all'
): void => {
  if (ids === 'all') {
    entry.ids = 'all'
    entry.paths.clear()
    return
  }

  if (entry.ids === 'all') {
    return
  }

  for (let index = 0; index < ids.length; index += 1) {
    entry.ids.add(ids[index]!)
  }
}

const addPathsToChange = (
  entry: DeltaAccumulatorEntry,
  paths: Record<string, readonly string[] | 'all'>
): void => {
  const entries = Object.entries(paths)

  for (let index = 0; index < entries.length; index += 1) {
    const [id, value] = entries[index]!
    if (value === 'all') {
      entry.paths.set(id, 'all')
      continue
    }

    const current = entry.paths.get(id)
    if (current === 'all') {
      continue
    }

    const next = current ?? new Set<string>()
    for (let pathIndex = 0; pathIndex < value.length; pathIndex += 1) {
      next.add(value[pathIndex]!)
    }
    entry.paths.set(id, next)
  }
}

const mergeMutationChange = (
  target: Map<string, DeltaAccumulatorEntry>,
  key: string,
  change: MutationChange
): void => {
  const current = target.get(key) ?? {
    full: false,
    ids: new Set<string>(),
    paths: new Map<string, Set<string> | 'all'>(),
    order: false,
    extra: {}
  }

  if (!target.has(key)) {
    target.set(key, current)
  }

  if (change === true) {
    current.full = true
    return
  }

  if (Array.isArray(change)) {
    addIdsToChange(current, change)
    return
  }

  if (!isMutationChangeObject(change)) {
    return
  }

  if (change.ids) {
    addIdsToChange(current, change.ids)
  }
  if (change.paths) {
    addPathsToChange(current, change.paths)
  }
  if (change.order) {
    current.order = true
  }

  const entries = Object.entries(change)
  for (let index = 0; index < entries.length; index += 1) {
    const [payloadKey, payloadValue] = entries[index]!
    if (
      payloadKey === 'ids'
      || payloadKey === 'paths'
      || payloadKey === 'order'
    ) {
      continue
    }

    current.extra[payloadKey] = cloneValue(payloadValue)
  }
}

const applyDeleteCoverage = (
  changes: Map<string, DeltaAccumulatorEntry>
): void => {
  const coveredIdsByFamily = new Map<string, Set<string> | 'all'>()

  changes.forEach((entry, key) => {
    if (!endsWithOperationKey(key, 'delete')) {
      return
    }

    const family = readFamilyFromKey(key)
    if (!family) {
      return
    }

    if (entry.full || entry.ids === 'all') {
      coveredIdsByFamily.set(family, 'all')
      return
    }

    const ids = new Set<string>()
    entry.ids.forEach((id) => {
      ids.add(id)
    })
    entry.paths.forEach((_value, id) => {
      ids.add(id)
    })
    if (ids.size > 0) {
      coveredIdsByFamily.set(family, ids)
    }
  })

  changes.forEach((entry, key) => {
    if (endsWithOperationKey(key, 'delete')) {
      return
    }

    const family = readFamilyFromKey(key)
    if (!family) {
      return
    }

    const covered = coveredIdsByFamily.get(family)
    if (!covered) {
      return
    }

    if (covered === 'all') {
      entry.full = false
      entry.ids = new Set<string>()
      entry.paths.clear()
      return
    }

    const ids = entry.ids
    if (ids !== 'all') {
      covered.forEach((id) => {
        ids.delete(id)
      })
    }

    covered.forEach((id) => {
      entry.paths.delete(id)
    })
  })
}

const finalizeMutationChange = (
  entry: DeltaAccumulatorEntry
): MutationChange | undefined => {
  const extraKeys = Object.keys(entry.extra)
  const hasIds = entry.ids === 'all' || entry.ids.size > 0
  const hasPaths = entry.paths.size > 0

  if (
    entry.full
    && !entry.order
    && !hasIds
    && !hasPaths
    && extraKeys.length === 0
  ) {
    return true
  }

  if (!entry.order && hasIds && !hasPaths && extraKeys.length === 0) {
    return entry.ids === 'all'
      ? {
          ids: 'all'
        }
      : toSortedArray(entry.ids)
  }

  if (!entry.order && !hasIds && !hasPaths && extraKeys.length === 0) {
    return undefined
  }

  const change: Record<string, unknown> = {}

  if (entry.ids === 'all') {
    change.ids = 'all'
  } else if (entry.ids.size > 0) {
    change.ids = toSortedArray(entry.ids)
  }

  if (entry.paths.size > 0) {
    const paths: Record<string, readonly string[] | 'all'> = {}
    entry.paths.forEach((value, id) => {
      paths[id] = value === 'all'
        ? 'all'
        : [...value].sort()
    })
    change.paths = paths
  }

  if (entry.order) {
    change.order = true
  }

  for (let index = 0; index < extraKeys.length; index += 1) {
    const extraKey = extraKeys[index]!
    change[extraKey] = cloneValue(entry.extra[extraKey])
  }

  return change as MutationChange
}

const normalizeMutationDelta = (
  input?: MutationDeltaInput
): MutationDelta => {
  if (!input) {
    return EMPTY_DELTA
  }

  const changes = new Map<string, DeltaAccumulatorEntry>()
  if (input.changes) {
    const entries = Object.entries(input.changes)
    for (let index = 0; index < entries.length; index += 1) {
      const [key, change] = entries[index]!
      mergeMutationChange(changes, key, change)
    }
  }

  applyDeleteCoverage(changes)

  const normalizedChanges: Record<string, MutationChange> = {}
  changes.forEach((entry, key) => {
    const change = finalizeMutationChange(entry)
    if (change !== undefined) {
      normalizedChanges[key] = change
    }
  })

  const hasChanges = Object.keys(normalizedChanges).length > 0
  if (!input.reset && !hasChanges) {
    return EMPTY_DELTA
  }

  return {
    ...(input.reset
      ? {
          reset: true
        }
      : {}),
    ...(hasChanges
      ? {
          changes: normalizedChanges
        }
      : {})
  }
}

const mergeMutationDeltas = (
  left: MutationDeltaInput | undefined,
  right: MutationDeltaInput | undefined
): MutationDelta => {
  if (!left) {
    return normalizeMutationDelta(right)
  }

  if (!right) {
    return normalizeMutationDelta(left)
  }

  const changes = new Map<string, DeltaAccumulatorEntry>()
  const sources = [left, right]

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex]
    if (!source?.changes) {
      continue
    }

    const entries = Object.entries(source.changes)
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const [key, change] = entries[entryIndex]!
      mergeMutationChange(changes, key, change)
    }
  }

  applyDeleteCoverage(changes)

  const normalizedChanges: Record<string, MutationChange> = {}
  changes.forEach((entry, key) => {
    const change = finalizeMutationChange(entry)
    if (change !== undefined) {
      normalizedChanges[key] = change
    }
  })

  const hasChanges = Object.keys(normalizedChanges).length > 0
  if (!(left.reset || right.reset) && !hasChanges) {
    return EMPTY_DELTA
  }

  return {
    ...(left.reset || right.reset
      ? {
          reset: true
        }
      : {}),
    ...(hasChanges
      ? {
          changes: normalizedChanges
        }
      : {})
  }
}

const createDeltaChangeForRule = (
  spec: CompiledEntitySpec,
  key: string,
  id: string | undefined,
  paths: readonly string[]
): MutationDeltaInput => {
  const fullKey = `${spec.family}.${key}`
  if (!id) {
    return {
      changes: {
        [fullKey]: true
      }
    }
  }

  return {
    changes: {
      [fullKey]: {
        ids: [id],
        ...(paths.length
          ? {
              paths: {
                [id]: paths
              }
            }
          : {})
      }
    }
  }
}

const createLifecycleDelta = (
  spec: CompiledEntitySpec,
  kind: MutationOperationKind,
  id: string | undefined
): MutationDeltaInput | undefined => {
  if (kind === 'patch') {
    return undefined
  }

  const key = `${spec.family}.${kind}`
  if (!id) {
    return {
      changes: {
        [key]: true
      }
    }
  }

  return {
    changes: {
      [key]: [id]
    }
  }
}

const buildEntityDelta = (
  spec: CompiledEntitySpec,
  operation: MutationCanonicalOperation,
  kind: MutationOperationKind,
  id: string | undefined,
  before: unknown,
  after: unknown,
  changedPaths: readonly string[]
): MutationDelta => {
  const inputs: MutationDeltaInput[] = []
  const lifecycle = createLifecycleDelta(spec, kind, id)
  if (lifecycle) {
    inputs.push(lifecycle)
  }

  for (let index = 0; index < spec.changeRules.length; index += 1) {
    const rule = spec.changeRules[index]!
    const matchedPaths = readMatchedRulePaths(rule, changedPaths)
    if (matchedPaths.length === 0) {
      continue
    }

    inputs.push(createDeltaChangeForRule(
      spec,
      rule.key,
      id,
      matchedPaths
    ))
  }

  if (typeof spec.changeFn === 'function') {
    const result = spec.changeFn({
      entity: id
        ? {
            id
          }
        : {},
      operation: {
        type: operation.type
      },
      before,
      after,
      changed: changedPaths
    })
    if (result?.changes) {
      inputs.push({
        changes: result.changes
      })
    }
  }

  let delta: MutationDelta = EMPTY_DELTA
  for (let index = 0; index < inputs.length; index += 1) {
    delta = mergeMutationDeltas(delta, inputs[index])
  }
  return delta
}

const hasDeltaFact = (
  delta: MutationDelta
): boolean => delta.reset === true || delta.changes !== undefined

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
  Services,
  Code extends string = string
>(input: {
  document: Doc
  operation: Op
  spec: MutationCustomSpec<Doc, Op, Services, Code>
  services: Services | undefined
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op, Code> => {
  try {
    const result = input.spec.reduce({
      op: input.operation,
      document: input.document,
      services: input.services,
      read: (reader) => reader(input.document),
      fail: (issue) => {
        throw new MutationCustomReduceError(issue)
      }
    })

    const next = result ?? {}
    const hasExplicitDelta = hasOwn(next, 'delta')
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

const dedupeFootprints = (
  footprints: readonly MutationFootprint[]
): readonly MutationFootprint[] => {
  const seen = new Set<string>()
  const deduped: MutationFootprint[] = []

  for (let index = 0; index < footprints.length; index += 1) {
    const footprint = footprints[index]!
    const key = JSON.stringify(footprint)
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    deduped.push(footprint)
  }

  return deduped
}

const buildEntityFootprint = (
  spec: CompiledEntitySpec,
  kind: MutationOperationKind,
  id: string | undefined,
  changedPaths: readonly string[]
): readonly MutationFootprint[] => {
  if (spec.kind === 'singleton' || !id) {
    return [{
      kind: 'global',
      family: spec.family
    }]
  }

  if (kind === 'create' || kind === 'delete') {
    return [{
      kind: 'entity',
      family: spec.family,
      id
    }]
  }

  const footprints: MutationFootprint[] = []
  for (let index = 0; index < changedPaths.length; index += 1) {
    const path = changedPaths[index]!
    const [memberName] = path.split('.')
    const member = memberName
      ? spec.members.get(memberName)
      : undefined
    if (!member) {
      continue
    }

    if (member.kind === 'field') {
      footprints.push({
        kind: 'field',
        family: spec.family,
        id,
        field: member.name
      })
      continue
    }

    footprints.push({
      kind: 'record',
      family: spec.family,
      id,
      scope: member.name,
      path
    })
  }

  return dedupeFootprints(footprints)
}

const readSingletonPath = (
  spec: CompiledEntitySpec
): string => spec.rootKey

const readTableEntityPath = (
  spec: CompiledEntitySpec,
  id: string
): string => appendPath(spec.rootKey, id)

const readEntityAtPath = (
  document: object,
  path: string
): unknown => path
  ? draft.record.read(document, path)
  : document

const applyRootWrites = <Doc extends object>(
  document: Doc,
  writes: RecordWrite
): Doc => Object.keys(writes).length === 0
  ? document
  : draft.record.apply(document, writes)

const createCanonicalCreateOperation = <Op extends { type: string }>(
  type: string,
  value: unknown
): Op => ({
  type,
  value
}) as unknown as Op

const createCanonicalPatchOperation = <Op extends { type: string }>(
  type: string,
  id: string | undefined,
  patch: MutationEntityPatch
): Op => ({
  type,
  ...(id
    ? {
        id
      }
    : {}),
  patch
}) as unknown as Op

const createCanonicalDeleteOperation = <Op extends { type: string }>(
  type: string,
  id: string | undefined
): Op => ({
  type,
  ...(id
    ? {
        id
      }
    : {})
}) as unknown as Op

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
}): {
  document: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  delta: MutationDelta
  footprint: readonly MutationFootprint[]
  outputs: readonly unknown[]
  issues: readonly MutationIssue[]
  historyMode: 'track'
} => {
  if (input.spec.family === DOCUMENT_FAMILY) {
    const nextDocument = input.normalize(cloneValue(input.value) as Doc)
    const inverse = createCanonicalCreateOperation<Op>(
      input.spec.createType,
      cloneValue(input.document)
    )
    const changedPaths = readEntitySnapshotPaths(input.spec, nextDocument)
    return {
      document: nextDocument,
      forward: [createCanonicalCreateOperation<Op>(
        input.spec.createType,
        cloneValue(input.value)
      )],
      inverse: [inverse],
      delta: buildEntityDelta(
        input.spec,
        {
          type: input.spec.createType,
          value: input.value
        },
        'create',
        undefined,
        input.document,
        nextDocument,
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
      historyMode: 'track'
    }
  }

  const rootPath = readSingletonPath(input.spec)
  const writes = Object.freeze({
    [rootPath]: cloneValue(input.value)
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
      cloneValue(input.value)
    )],
    inverse: [inverse],
    delta: buildEntityDelta(
      input.spec,
      {
        type: input.spec.createType,
        value: input.value
      },
      'create',
      undefined,
      undefined,
      input.value,
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
    historyMode: 'track'
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
}): {
  document: Doc
  forward: readonly Op[]
  inverse: readonly Op[]
  delta: MutationDelta
  footprint: readonly MutationFootprint[]
  outputs: readonly unknown[]
  issues: readonly MutationIssue[]
  historyMode: 'track'
} => {
  if (input.spec.family === DOCUMENT_FAMILY) {
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
    cloneValue(current)
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
      {
        type: input.spec.deleteType
      },
      'delete',
      undefined,
      current,
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
    historyMode: 'track'
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
  kind: MutationOperationKind
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op> => {
  const operation = input.operation as MutationCanonicalOperation
  const spec = input.spec

  try {
    if (spec.kind === 'table') {
      if (input.kind === 'create') {
        const value = readRequiredValue(spec.family, 'create', operation)
        const id = readEntityIdFromValue(spec.family, value)
        const entityPath = readTableEntityPath(spec, id)
        if (readEntityAtPath(input.document, entityPath) !== undefined) {
          throw new Error(`Mutation operation "${spec.family}.create" found an existing entity "${id}".`)
        }
        const writes = Object.freeze({
          [entityPath]: cloneValue(value)
        })
        const nextDocument = applyRootWrites(input.document, writes)
        const changedPaths = readEntitySnapshotPaths(spec, value)

        return {
          ok: true,
          data: {
            document: input.normalize(nextDocument),
            forward: [createCanonicalCreateOperation<Op>(
              spec.createType,
              cloneValue(value)
            )],
            inverse: [createCanonicalDeleteOperation<Op>(spec.deleteType, id)],
            delta: buildEntityDelta(
              spec,
              {
                type: spec.createType,
                value
              },
              'create',
              id,
              undefined,
              value,
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
        const writes = Object.freeze({
          [entityPath]: undefined
        })
        const nextDocument = applyRootWrites(input.document, writes)
        const changedPaths = readEntitySnapshotPaths(spec, current)

        return {
          ok: true,
          data: {
            document: input.normalize(nextDocument),
            forward: [createCanonicalDeleteOperation<Op>(spec.deleteType, id)],
            inverse: [createCanonicalCreateOperation<Op>(spec.createType, cloneValue(current))],
            delta: buildEntityDelta(
              spec,
              {
                type: spec.deleteType,
                id
              },
              'delete',
              id,
              current,
              undefined,
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
            {
              type: spec.patchType,
              id,
              patch
            },
            'patch',
            id,
            current,
            nextEntity,
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
      const result = readSingletonCreateResult<Doc, Op>({
        spec,
        document: input.document,
        value,
        normalize: input.normalize
      })
      return {
        ok: true,
        data: result
      }
    }

    if (input.kind === 'delete') {
      const result = readSingletonDeleteResult<Doc, Op>({
        spec,
        document: input.document
      })
      return {
        ok: true,
        data: result
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

    const current = readEntityAtPath(
      input.document,
      readSingletonPath(spec)
    )
    const nextEntity = draft.record.apply(current, entityWrites)
    const inverseWrites = draft.record.inverse(current, entityWrites)
    const rootWrites = prefixRecordWrites(readSingletonPath(spec), entityWrites)
    const nextDocument = spec.family === DOCUMENT_FAMILY
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
          {
            type: spec.patchType,
            patch
          },
          'patch',
          undefined,
          current,
          nextEntity,
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

const mutationFootprintConflicts = (
  left: MutationFootprint,
  right: MutationFootprint
): boolean => {
  if (left.family !== right.family) {
    return false
  }

  if (left.kind === 'global' || right.kind === 'global') {
    return true
  }

  if (left.kind === 'entity') {
    return (
      right.kind === 'entity'
      || right.kind === 'field'
      || right.kind === 'record'
      || right.kind === 'relation'
    ) && left.id === right.id
  }

  if (right.kind === 'entity') {
    return mutationFootprintConflicts(right, left)
  }

  if (left.id !== right.id) {
    return false
  }

  if (left.kind === 'field' && right.kind === 'field') {
    return left.field === right.field
  }

  if (left.kind === 'field' && right.kind === 'record') {
    return left.field === right.scope
  }

  if (left.kind === 'record' && right.kind === 'field') {
    return left.scope === right.field
  }

  if (left.kind === 'record' && right.kind === 'record') {
    return left.scope === right.scope && (
      left.path === right.path
      || left.path.startsWith(`${right.path}.`)
      || right.path.startsWith(`${left.path}.`)
    )
  }

  if (left.kind === 'relation' && right.kind === 'relation') {
    return left.relation === right.relation && (
      left.target === undefined
      || right.target === undefined
      || left.target === right.target
    )
  }

  if (left.kind === 'relation' || right.kind === 'relation') {
    return true
  }

  return false
}

const mutationFootprintBatchConflicts = (
  left: readonly MutationFootprint[],
  right: readonly MutationFootprint[]
): boolean => {
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (mutationFootprintConflicts(left[leftIndex]!, right[rightIndex]!)) {
        return true
      }
    }
  }

  return false
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
  Services,
  Code extends string = string
>(input: {
  document: Doc
  operations: readonly Op[]
  entities: ReadonlyMap<string, CompiledEntitySpec>
  custom?: MutationCustomTable<Doc, Op, Services, Code>
  services: Services | undefined
  normalize(doc: Doc): Doc
}): MutationApplyResult<Doc, Op, Code> => {
  let currentDocument = input.document
  let delta: MutationDelta = EMPTY_DELTA
  const forward: Op[] = []
  const inverse: Op[] = []
  const footprint: MutationFootprint[] = []
  const outputs: unknown[] = []
  const issues: MutationIssue[] = []
  let hasTrackedHistory = false
  let skipHistory = false

  for (let index = 0; index < input.operations.length; index += 1) {
    const operation = input.operations[index]!
    const descriptor = readCanonicalOperation(operation.type)
    const applied = descriptor
      ? (() => {
          const spec = input.entities.get(descriptor.family)
          if (!spec) {
            return mutationFailure(
              'mutation_engine.apply.unknown_family' as Code,
              `Unknown mutation entity family "${descriptor.family}".`
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
      : (() => {
          const customSpec = input.custom?.[operation.type]
          if (!customSpec) {
            return mutationFailure(
              'mutation_engine.apply.unknown_operation' as Code,
              `Unknown mutation operation "${operation.type}".`
            )
          }

          return readCustomOperationResult<Doc, Op, Services, Code>({
            document: currentDocument,
            operation,
            spec: customSpec,
            services: input.services,
            normalize: input.normalize
          })
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
  Services,
  Code extends string = string
>(input: {
  document: Doc
  intents: readonly MutationIntentOf<Table>[]
  handlers: MutationCompileHandlerTable<Table, Doc, Op, Services, Code>
  services: Services | undefined
  entities: ReadonlyMap<string, CompiledEntitySpec>
  custom?: MutationCustomTable<Doc, Op, Services, Code>
  normalize(doc: Doc): Doc
}): CompileLoopResult<Doc, Op, MutationOutputOf<Table>, Code> => {
  const ops: Op[] = []
  const outputs: MutationOutputOf<Table>[] = []
  const issues: MutationCompileIssue<Code>[] = []
  let workingDocument = input.document

  for (let index = 0; index < input.intents.length; index += 1) {
    const intent = input.intents[index]!
    const pendingOps: Op[] = []
    const pendingOutputs: MutationOutputOf<Table>[] = []
    const pendingIssues: MutationCompileIssue<Code>[] = []
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
      Services,
      Code
    > = {
      intent,
      document: workingDocument,
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

    const applied = applyConcreteOperations<Doc, Op, Services, Code>({
      document: workingDocument,
      operations: pendingOps,
      entities: input.entities,
      custom: input.custom,
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
  Services,
  Code extends string = string
> {
  readonly history: HistoryPort<
    MutationResult<void, ApplyCommit<Doc, Op, MutationFootprint, void>, Code>,
    Op,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void>
  >

  private readonly normalize: (doc: Doc) => Doc
  private readonly entities: ReadonlyMap<string, CompiledEntitySpec>
  private readonly custom?: MutationCustomTable<Doc, Op, Services, Code>
  private readonly services: Services | undefined
  private readonly compileHandlers?: MutationCompileHandlerTable<any, Doc, Op, Services, Code>
  private readonly historyOptions?: MutationHistoryOptions | false
  private readonly historyControllerRef?: HistoryController<
    Op,
    MutationFootprint,
    ApplyCommit<Doc, Op, MutationFootprint, void>
  >
  private readonly watchListeners = new Set<(current: MutationCurrent<Doc>) => void>()
  private readonly commitListeners = new Set<(commit: CommitRecord<Doc, Op, MutationFootprint, void>) => void>()
  private readonly commitStream: CommitStream<CommitRecord<Doc, Op, MutationFootprint, void>>
  private rev = 0
  private documentState: Doc

  constructor(input: {
    document: Doc
    normalize(doc: Doc): Doc
    entities: Readonly<Record<string, MutationEntitySpec>>
    custom?: MutationCustomTable<Doc, Op, Services, Code>
    services?: Services
    compile?: MutationCompileHandlerTable<any, Doc, Op, Services, Code>
    history?: MutationHistoryOptions | false
  }) {
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

    this.commitStream = {
      subscribe: (listener) => {
        this.commitListeners.add(listener)
        return () => {
          this.commitListeners.delete(listener)
        }
      }
    }

    this.history = createHistoryPort({
      apply: (operations, options) => this.apply(operations, options),
      commits: this.commitStream,
      historyController: () => this.historyControllerRef
    })
  }

  document(): Doc {
    return this.documentState
  }

  read<T>(
    reader: (document: Doc) => T
  ): T {
    return reader(this.documentState)
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
        reset: true
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

    const applied = applyConcreteOperations<Doc, Op, Services, Code>({
      document: this.documentState,
      operations,
      entities: this.entities,
      custom: this.custom,
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

    const planned = compileMutationIntents<Doc, Table, Op, Services, Code>({
      document: this.documentState,
      intents,
      handlers: this.compileHandlers,
      services: this.services,
      entities: this.entities,
      custom: this.custom,
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

    const applied = applyConcreteOperations<Doc, Op, Services, Code>({
      document: this.documentState,
      operations: planned.ops,
      entities: this.entities,
      custom: this.custom,
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
    delta: MutationDelta
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
  Services = void,
  Code extends string = string
> {
  private readonly runtime: MutationRuntime<Doc, Op, Services, Code>

  constructor(input: MutationEngineOptions<Doc, Table, Op, Services, Code>) {
    this.runtime = new MutationRuntime({
      document: input.document,
      normalize: input.normalize,
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

  read<T>(
    reader: (document: Doc) => T
  ): T {
    return this.runtime.read(reader)
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
