import {
  draft,
  type RecordWrite
} from '@shared/draft'
import {
  createMutationProgramWriter
} from './program/writer'
import {
  appendPath,
  cloneValue,
  COMPILE_APPLY_FAILED_CODE,
  type CompiledChangeRule,
  type CompiledEntitySpec,
  type CompiledMemberSpec,
  type CompiledPathSelector,
  DOCUMENT_FAMILY,
  hasOwn,
  isObjectRecord,
  mutationFailure,
  type MutableRecordWrite,
  type MutationApplyResult,
  type MutationEntityCanonicalOperation,
  type MutationEntityPatch,
  type MutationEntitySpec,
  type MutationOperationKind,
  sameJsonValue
} from './contracts'
import type {
  MutationProgram
} from './program/program'

export const collectRecordLeafPaths = (
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

export const readMatchedRulePaths = (
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

  const changeRules = spec.change
    ? Object.entries(spec.change).map(([key, selectors]) => ({
        key,
        selectors: selectors.map((selector) => compilePathSelector(members, selector))
      }))
    : []

  const rootKey = spec.kind === 'table' || spec.kind === 'map'
    ? `${family}s`
    : family === DOCUMENT_FAMILY
      ? ''
      : family

  return {
    family,
    kind: spec.kind,
    rootKey,
    members,
    changeRules,
    createType: `${family}.create`,
    patchType: `${family}.patch`,
    deleteType: `${family}.delete`
  }
}

export const compileEntities = (
  entities: Readonly<Record<string, MutationEntitySpec>> | undefined
): ReadonlyMap<string, CompiledEntitySpec> => {
  const compiled = new Map<string, CompiledEntitySpec>()
  const entries = Object.entries(entities ?? {})

  for (let index = 0; index < entries.length; index += 1) {
    const [family, spec] = entries[index]!
    compiled.set(
      family,
      compileEntitySpec(family, spec)
    )
  }

  return compiled
}

export const readCanonicalOperation = (
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

export const lowerCanonicalEntityOperation = (input: {
  operation: MutationEntityCanonicalOperation
  spec: CompiledEntitySpec
  kind: MutationOperationKind
}): MutationProgram => {
  const builder = createMutationProgramWriter()

  if (input.kind === 'create') {
    const value = readRequiredValue(input.spec.family, 'create', input.operation)
    builder.entity.create(
      {
        kind: 'entity',
        type: input.spec.family,
        id: input.spec.kind === 'singleton'
          ? input.spec.family
          : readEntityIdFromValue(input.spec.family, value)
      },
      value
    )
    return builder.build()
  }

  if (input.kind === 'delete') {
    builder.entity.delete({
      kind: 'entity',
      type: input.spec.family,
      id: input.spec.kind === 'singleton'
        ? input.spec.family
        : readRequiredId(input.spec.family, input.operation)
    })
    return builder.build()
  }

  const patch = readRequiredPatch(input.spec.family, input.operation)
  builder.entity.patch(
    {
      kind: 'entity',
      type: input.spec.family,
      id: input.spec.kind === 'singleton'
        ? input.spec.family
        : readRequiredId(input.spec.family, input.operation)
    },
    compileEntityPatchWrites(input.spec, patch)
  )
  return builder.build()
}

export const readRequiredId = (
  family: string,
  op: MutationEntityCanonicalOperation
): string => {
  if (typeof op.id !== 'string' || op.id.length === 0) {
    throw new Error(`Mutation operation "${family}" requires a non-empty id.`)
  }

  return op.id
}

export const readRequiredValue = (
  family: string,
  kind: MutationOperationKind,
  op: MutationEntityCanonicalOperation
): unknown => {
  if (!hasOwn(op, 'value')) {
    throw new Error(`Mutation operation "${family}.${kind}" requires a value.`)
  }

  return op.value
}

export const readRequiredPatch = (
  family: string,
  op: MutationEntityCanonicalOperation
): MutationEntityPatch => {
  if (!isObjectRecord(op.patch)) {
    throw new Error(`Mutation operation "${family}.patch" requires an object patch.`)
  }

  return op.patch
}

export const readEntityIdFromValue = (
  family: string,
  value: unknown
): string => {
  if (!isObjectRecord(value) || typeof value.id !== 'string' || value.id.length === 0) {
    throw new Error(`Mutation operation "${family}.create" requires value.id.`)
  }

  return value.id
}

export const compileEntityPatchWrites = (
  spec: CompiledEntitySpec,
  patch: MutationEntityPatch
): RecordWrite => {
  const writes: MutableRecordWrite = {}
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

export const readChangedPathsFromWrites = (
  writes: RecordWrite
): readonly string[] => Object.keys(writes).sort()

export const readEntitySnapshotPaths = (
  spec: CompiledEntitySpec,
  entity: unknown
): readonly string[] => {
  if (!isObjectRecord(entity)) {
    return []
  }

  const paths = new Set<string>()
  for (const member of spec.members.values()) {
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

const collectChangedRecordPaths = (
  before: unknown,
  after: unknown,
  basePath: string,
  target: Set<string>
): void => {
  if (sameJsonValue(before, after)) {
    return
  }

  const beforeRecord = isObjectRecord(before)
    ? before
    : undefined
  const afterRecord = isObjectRecord(after)
    ? after
    : undefined

  if (!beforeRecord || !afterRecord) {
    target.add(basePath)
    return
  }

  const keys = new Set([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord)
  ])
  if (keys.size === 0) {
    target.add(basePath)
    return
  }

  keys.forEach((key) => {
    collectChangedRecordPaths(
      beforeRecord[key],
      afterRecord[key],
      appendPath(basePath, key),
      target
    )
  })
}

export const readEntityChangedPaths = (
  spec: CompiledEntitySpec,
  before: unknown,
  after: unknown
): readonly string[] => {
  const changed = new Set<string>()
  const beforeRecord = isObjectRecord(before)
    ? before
    : undefined
  const afterRecord = isObjectRecord(after)
    ? after
    : undefined

  for (const member of spec.members.values()) {
    const beforeValue = beforeRecord?.[member.name]
    const afterValue = afterRecord?.[member.name]

    if (member.kind === 'field') {
      if (!sameJsonValue(beforeValue, afterValue)) {
        changed.add(member.name)
      }
      continue
    }

    collectChangedRecordPaths(
      beforeValue,
      afterValue,
      member.name,
      changed
    )
  }

  return [...changed].sort()
}

export const createPatchFromWrites = (
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

export const prefixRecordWrites = (
  basePath: string,
  writes: RecordWrite
): RecordWrite => {
  if (!basePath) {
    return writes
  }

  const prefixed: MutableRecordWrite = {}
  const entries = Object.entries(writes)

  for (let index = 0; index < entries.length; index += 1) {
    const [path, value] = entries[index]!
    prefixed[appendPath(basePath, path)] = cloneValue(value)
  }

  return Object.freeze(prefixed)
}

export const readSingletonPath = (
  spec: CompiledEntitySpec
): string => spec.rootKey

const readTableByIdPath = (
  spec: CompiledEntitySpec
): string => spec.kind === 'table'
  ? appendPath(spec.rootKey, 'byId')
  : spec.rootKey

export const readTableEntityPath = (
  spec: CompiledEntitySpec,
  id: string
): string => appendPath(readTableByIdPath(spec), id)

const readTableIdsPath = (
  spec: CompiledEntitySpec
): string | undefined => spec.kind === 'table'
  ? appendPath(spec.rootKey, 'ids')
  : undefined

export const readEntityAtPath = (
  document: object,
  path: string
): unknown => path
  ? draft.record.read(document, path)
  : document

export const readEntityValue = (
  document: object,
  spec: CompiledEntitySpec,
  id?: string
): unknown => spec.kind === 'singleton'
  ? readEntityAtPath(document, readSingletonPath(spec))
  : id
    ? readEntityAtPath(document, readTableEntityPath(spec, id))
    : undefined

export const applyRootWrites = <Doc extends object>(
  document: Doc,
  writes: RecordWrite | MutableRecordWrite
): Doc => Object.keys(writes).length === 0
  ? document
  : draft.record.apply(document, writes)

const readTableIds = (
  document: object,
  spec: CompiledEntitySpec
): readonly string[] | undefined => {
  const path = readTableIdsPath(spec)
  if (!path) {
    return undefined
  }
  const ids = readEntityAtPath(document, path)
  return Array.isArray(ids)
    ? ids.filter((value): value is string => typeof value === 'string')
    : undefined
}

export const appendTableCreateWrites = (
  writes: MutableRecordWrite,
  document: object,
  spec: CompiledEntitySpec,
  id: string
) => {
  const idsPath = readTableIdsPath(spec)
  if (!idsPath) {
    return
  }
  const currentIds = readTableIds(document, spec) ?? []
  if (currentIds.includes(id)) {
    writes[idsPath] = currentIds
    return
  }
  writes[idsPath] = [...currentIds, id]
}

export const appendTableDeleteWrites = (
  writes: MutableRecordWrite,
  document: object,
  spec: CompiledEntitySpec,
  id: string
) => {
  const idsPath = readTableIdsPath(spec)
  if (!idsPath) {
    return
  }
  const currentIds = readTableIds(document, spec) ?? []
  if (!currentIds.includes(id)) {
    writes[idsPath] = currentIds
    return
  }
  writes[idsPath] = currentIds.filter((currentId) => currentId !== id)
}

export const invalidCanonicalOperation = <
  Doc,
  Code extends string = string
>(
  error: unknown
): MutationApplyResult<Doc, Code> => mutationFailure(
  COMPILE_APPLY_FAILED_CODE as Code,
  error instanceof Error
    ? error.message
    : 'MutationEngine.apply received an invalid canonical operation.'
)
