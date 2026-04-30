import type {
  CompiledEntitySpec,
  MutationFootprint,
  MutationOperationKind
} from './contracts'

export const dedupeFootprints = (
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

export const buildEntityFootprint = (
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

    const scopedPath = path === member.name
      ? ''
      : path.startsWith(`${member.name}.`)
        ? path.slice(member.name.length + 1)
        : path
    footprints.push({
      kind: 'record',
      family: spec.family,
      id,
      scope: member.name,
      path: scopedPath
    })
  }

  return dedupeFootprints(footprints)
}

export const mutationFootprintConflicts = (
  left: MutationFootprint,
  right: MutationFootprint
): boolean => {
  const leftStructural = (
    left.kind === 'structure'
    || left.kind === 'structure-item'
    || left.kind === 'structure-parent'
  )
  const rightStructural = (
    right.kind === 'structure'
    || right.kind === 'structure-item'
    || right.kind === 'structure-parent'
  )

  if (leftStructural || rightStructural) {
    if (!leftStructural || !rightStructural || left.structure !== right.structure) {
      return false
    }

    if (left.kind === 'structure' || right.kind === 'structure') {
      return true
    }

    return left.id === right.id && left.kind === right.kind
  }

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

export const mutationFootprintBatchConflicts = (
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
