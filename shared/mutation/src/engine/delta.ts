import type {
  CompiledEntitySpec,
  DeltaAccumulatorEntry,
  MutationChange,
  MutationChangeInput,
  MutationDelta,
  MutationDeltaInput,
  MutationEntityEffectInput,
  MutationEntitySpec,
  MutationStructureChangeSpec,
} from './contracts'
import {
  cloneValue,
  EMPTY_DELTA,
  EMPTY_MUTATION_IDS,
  EMPTY_MUTATION_CHANGES,
  endsWithOperationKey,
  hasOwn,
  isMutationChangeObject,
  readChangeEntries,
  readFamilyFromKey,
  toSortedArray
} from './contracts'
import {
  compileEntities,
  readEntityChangedPaths,
  readEntitySnapshotPaths,
  readEntityValue,
  readMatchedRulePaths
} from './entity'
import {
  buildEntityFootprint,
  dedupeFootprints
} from './footprint'
import type {
  MutationFootprint,
  MutationEntityChangeKind
} from './contracts'

const addIdsToChange = (
  entry: DeltaAccumulatorEntry,
  ids: readonly string[] | 'all'
): void => {
  if (ids === 'all') {
    entry.ids = 'all'
    entry.pathsAll = false
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
  paths: Record<string, readonly string[] | 'all'> | 'all'
): void => {
  if (paths === 'all') {
    entry.pathsAll = true
    return
  }

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
  change: MutationChangeInput
): void => {
  const current = target.get(key) ?? {
    full: false,
    ids: new Set<string>(),
    pathsAll: false,
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
      entry.pathsAll = false
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
  const hasPaths = entry.pathsAll || entry.paths.size > 0

  if (
    entry.full
    && !entry.order
    && !hasIds
    && !hasPaths
    && extraKeys.length === 0
  ) {
    return {
      ids: 'all'
    }
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

  if (entry.pathsAll) {
    change.paths = 'all'
  } else if (entry.paths.size > 0) {
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

const readMutationPaths = (
  change: MutationChange | undefined,
  id: string
): readonly string[] | 'all' | undefined => {
  if (!change) {
    return undefined
  }
  if (change.paths === 'all') {
    return 'all'
  }
  return change.paths?.[id]
}

const readMutationIds = (
  change: MutationChange | undefined
): ReadonlySet<string> | 'all' => {
  if (!change) {
    return EMPTY_MUTATION_IDS
  }
  if (change.ids === 'all' || change.paths === 'all') {
    return 'all'
  }
  if (Array.isArray(change.ids)) {
    return new Set(change.ids)
  }
  if (change.paths) {
    return new Set(Object.keys(change.paths))
  }
  return EMPTY_MUTATION_IDS
}

const withMutationDeltaReadApi = (
  input: {
    reset?: true
    changes: MutationDelta['changes']
  }
): MutationDelta => {
  const delta: MutationDelta = {
    ...(input.reset
      ? {
          reset: true
        }
      : {}),
    changes: input.changes,
    has: (key) => delta.reset === true || hasOwn(delta.changes, key),
    changed: (key, id) => {
      if (delta.reset === true) {
        return true
      }
      const change = delta.changes[key]
      if (id === undefined) {
        return change !== undefined
      }
      const ids = readMutationIds(change)
      if (ids === 'all' || ids.has(id)) {
        return true
      }
      const paths = readMutationPaths(change, id)
      return paths === 'all'
        || (Array.isArray(paths) && paths.length > 0)
    },
    ids: (key) => delta.reset === true
      ? 'all'
      : readMutationIds(delta.changes[key]),
    paths: (key, id) => delta.reset === true
      ? 'all'
      : readMutationPaths(delta.changes[key], id)
  }
  return Object.freeze(delta)
}

export const normalizeMutationDelta = (
  input?: MutationDeltaInput | MutationDelta
): MutationDelta => {
  if (!input) {
    return EMPTY_DELTA
  }

  const changes = new Map<string, DeltaAccumulatorEntry>()
  if (input.changes) {
    const entries = readChangeEntries({
      changes: input.changes
    })
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

  return withMutationDeltaReadApi({
    ...(input.reset
      ? {
          reset: true as const
        }
      : {}),
    changes: hasChanges
      ? normalizedChanges
      : EMPTY_MUTATION_CHANGES
  })
}

export const mergeMutationDeltas = (
  left: MutationDeltaInput | MutationDelta | undefined,
  right: MutationDeltaInput | MutationDelta | undefined
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

    const entries = readChangeEntries({
      changes: source.changes
    })
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

  return withMutationDeltaReadApi({
    ...(left.reset || right.reset
      ? {
          reset: true as const
        }
      : {}),
    changes: hasChanges
      ? normalizedChanges
      : EMPTY_MUTATION_CHANGES
  })
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
  kind: MutationEntityChangeKind,
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

export const buildEntityDelta = (
  spec: CompiledEntitySpec,
  kind: MutationEntityChangeKind,
  id: string | undefined,
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

  let delta: MutationDelta = EMPTY_DELTA
  for (let index = 0; index < inputs.length; index += 1) {
    delta = mergeMutationDeltas(delta, inputs[index])
  }
  return delta
}

export const buildStructureDelta = (
  changes: readonly MutationStructureChangeSpec[] | undefined
): MutationDelta => {
  if (!changes || changes.length === 0) {
    return EMPTY_DELTA
  }

  let delta = EMPTY_DELTA
  for (let index = 0; index < changes.length; index += 1) {
    const entry = changes[index]!
    delta = mergeMutationDeltas(delta, {
      changes: {
        [entry.key]: entry.change ?? true
      }
    })
  }

  return delta
}

export const hasDeltaFact = (
  delta: MutationDelta
): boolean => delta.reset === true || Object.keys(delta.changes).length > 0

const uniqueSorted = (
  values: Iterable<string>
): readonly string[] => [...new Set(values)].sort()

export const compileMutationEntityEffects = <Doc extends object>(input: {
  entities: Readonly<Record<string, MutationEntitySpec>> | ReadonlyMap<string, CompiledEntitySpec>
  before: Doc
  after: Doc
  effects: readonly MutationEntityEffectInput[]
  extraDelta?: MutationDeltaInput | MutationDelta
  extraFootprint?: readonly MutationFootprint[]
}): {
  delta: MutationDelta
  footprint: readonly MutationFootprint[]
  } => {
  const compiled = input.entities instanceof Map
    ? input.entities as ReadonlyMap<string, CompiledEntitySpec>
    : compileEntities(input.entities as Readonly<Record<string, MutationEntitySpec>>)
  let delta = normalizeMutationDelta(input.extraDelta)
  const footprint: MutationFootprint[] = [
    ...(input.extraFootprint ?? [])
  ]

  for (let index = 0; index < input.effects.length; index += 1) {
    const effect = input.effects[index]!
    const spec = compiled.get(effect.family)
    if (!spec) {
      throw new Error(`Unknown mutation entity family "${effect.family}".`)
    }

    const createdIds = uniqueSorted(effect.created ?? [])
    const deletedIds = uniqueSorted(effect.deleted ?? [])
    const touchedIds = uniqueSorted(effect.touched ?? [])

    for (let idIndex = 0; idIndex < createdIds.length; idIndex += 1) {
      const id = createdIds[idIndex]!
      const afterValue = readEntityValue(input.after, spec, id)
      const changedPaths = readEntitySnapshotPaths(spec, afterValue)
      delta = mergeMutationDeltas(
        delta,
        buildEntityDelta(spec, 'create', spec.kind === 'singleton' ? undefined : id, changedPaths)
      )
      footprint.push(
        ...buildEntityFootprint(
          spec,
          'create',
          spec.kind === 'singleton' ? undefined : id,
          changedPaths
        )
      )
    }

    for (let idIndex = 0; idIndex < deletedIds.length; idIndex += 1) {
      const id = deletedIds[idIndex]!
      const beforeValue = readEntityValue(input.before, spec, id)
      const changedPaths = readEntitySnapshotPaths(spec, beforeValue)
      delta = mergeMutationDeltas(
        delta,
        buildEntityDelta(spec, 'delete', spec.kind === 'singleton' ? undefined : id, changedPaths)
      )
      footprint.push(
        ...buildEntityFootprint(
          spec,
          'delete',
          spec.kind === 'singleton' ? undefined : id,
          changedPaths
        )
      )
    }

    for (let idIndex = 0; idIndex < touchedIds.length; idIndex += 1) {
      const id = touchedIds[idIndex]!
      const entityId = spec.kind === 'singleton'
        ? undefined
        : id
      const beforeValue = readEntityValue(input.before, spec, entityId)
      const afterValue = readEntityValue(input.after, spec, entityId)
      if (beforeValue === undefined || afterValue === undefined) {
        continue
      }

      const changedPaths = readEntityChangedPaths(spec, beforeValue, afterValue)
      if (changedPaths.length === 0) {
        continue
      }

      delta = mergeMutationDeltas(
        delta,
        buildEntityDelta(spec, 'patch', entityId, changedPaths)
      )
      footprint.push(
        ...buildEntityFootprint(
          spec,
          'patch',
          entityId,
          changedPaths
        )
      )
    }
  }

  return {
    delta,
    footprint: dedupeFootprints(footprint)
  }
}
