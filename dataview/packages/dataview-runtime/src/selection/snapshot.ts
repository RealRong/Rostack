import type {
  OrderedSelectionDomain,
  SelectionApplyMode,
  SelectionScope,
  SelectionShape,
  SelectionSnapshot,
  SelectionSummary
} from '@dataview/runtime/selection/types'
import {
  set as setCore
} from '@shared/core'

const asEmptySet = <TId,>(): ReadonlySet<TId> => setCore.empty<TId>()

const sameShape = <TId,>(
  left: SelectionShape<TId>,
  right: SelectionShape<TId>
) => {
  if (left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'empty') {
    return true
  }

  if (right.kind === 'empty') {
    return false
  }

  return setCore.same(left.ids, right.ids)
}

const collectValidIds = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  ids: Iterable<TId>
): Set<TId> => {
  const next = new Set<TId>()
  for (const id of ids) {
    if (!domain.has(id)) {
      continue
    }

    next.add(id)
  }
  return next
}

const complementIds = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  ids: ReadonlySet<TId>
): Set<TId> => {
  const next = new Set<TId>()
  for (const candidate of domain.iterate()) {
    if (ids.has(candidate)) {
      continue
    }

    next.add(candidate)
  }
  return next
}

const shapeContains = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  shape: SelectionShape<TId>,
  id: TId
) => {
  switch (shape.kind) {
    case 'empty':
      return false
    case 'include':
      return shape.ids.has(id)
    case 'exclude':
      return domain.has(id) && !shape.ids.has(id)
  }
}

const firstSelected = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  shape: SelectionShape<TId>
): TId | undefined => {
  if (shape.kind === 'empty') {
    return undefined
  }

  for (let index = 0; index < domain.count; index += 1) {
    const id = domain.at(index)
    if (id === undefined || !shapeContains(domain, shape, id)) {
      continue
    }

    return id
  }

  return undefined
}

const lastSelected = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  shape: SelectionShape<TId>
): TId | undefined => {
  if (shape.kind === 'empty') {
    return undefined
  }

  for (let index = domain.count - 1; index >= 0; index -= 1) {
    const id = domain.at(index)
    if (id === undefined || !shapeContains(domain, shape, id)) {
      continue
    }

    return id
  }

  return undefined
}

const finalizeSnapshot = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  shape: SelectionShape<TId>,
  input: {
    domainRevision: number
    anchor?: TId
    focus?: TId
    selectedCount: number
  }
): SelectionSnapshot<TId> => {
  if (!input.selectedCount || !domain.count || shape.kind === 'empty') {
    return {
      shape: {
        kind: 'empty'
      },
      selectedCount: 0,
      domainRevision: input.domainRevision
    }
  }

  const anchor = input.anchor !== undefined && shapeContains(domain, shape, input.anchor)
    ? input.anchor
    : firstSelected(domain, shape)
  const focus = input.focus !== undefined && shapeContains(domain, shape, input.focus)
    ? input.focus
    : lastSelected(domain, shape)

  return {
    shape,
    selectedCount: input.selectedCount,
    domainRevision: input.domainRevision,
    ...(anchor !== undefined
      ? {
          anchor
        }
      : {}),
    ...(focus !== undefined
      ? {
          focus
        }
      : {})
  }
}

const createFromIncludedIds = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  ids: ReadonlySet<TId>,
  input: {
    domainRevision: number
    anchor?: TId
    focus?: TId
  }
  ): SelectionSnapshot<TId> => {
  const selectedCount = ids.size
  if (!selectedCount || !domain.count) {
    return selectionSnapshot.empty<TId>(input.domainRevision)
  }

  if (selectedCount >= domain.count) {
    return finalizeSnapshot(
      domain,
      {
        kind: 'exclude',
        ids: asEmptySet<TId>()
      },
      {
        ...input,
        selectedCount: domain.count
      }
    )
  }

  const useInclude = selectedCount <= domain.count - selectedCount
  const shape = useInclude
    ? {
        kind: 'include' as const,
        ids
      }
    : {
        kind: 'exclude' as const,
        ids: complementIds(domain, ids)
      }

  return finalizeSnapshot(domain, shape, {
    ...input,
    selectedCount
  })
}

const createFromExcludedIds = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  ids: ReadonlySet<TId>,
  input: {
    domainRevision: number
    anchor?: TId
    focus?: TId
  }
  ): SelectionSnapshot<TId> => {
  const selectedCount = Math.max(0, domain.count - ids.size)
  if (!selectedCount || !domain.count) {
    return selectionSnapshot.empty<TId>(input.domainRevision)
  }

  if (!ids.size) {
    return finalizeSnapshot(
      domain,
      {
        kind: 'exclude',
        ids: asEmptySet<TId>()
      },
      {
        ...input,
        selectedCount: domain.count
      }
    )
  }

  const useExclude = ids.size <= selectedCount
  const shape = useExclude
    ? {
        kind: 'exclude' as const,
        ids
      }
    : {
        kind: 'include' as const,
        ids: complementIds(domain, ids)
      }

  return finalizeSnapshot(domain, shape, {
    ...input,
    selectedCount
  })
}

const readSnapshotContext = <TId,>(
  current: SelectionSnapshot<TId>,
  domainRevision: number
) => ({
  domainRevision,
  anchor: current.anchor,
  focus: current.focus
})

const updateSnapshotIds = <TId,>(input: {
  domain: OrderedSelectionDomain<TId>
  current: SelectionSnapshot<TId>
  domainRevision: number
  targetIds: ReadonlySet<TId>
  whenEmpty: () => SelectionSnapshot<TId>
  updateInclude: (ids: ReadonlySet<TId>, targetIds: ReadonlySet<TId>) => ReadonlySet<TId>
  updateExclude: (ids: ReadonlySet<TId>, targetIds: ReadonlySet<TId>) => ReadonlySet<TId>
}): SelectionSnapshot<TId> => {
  switch (input.current.shape.kind) {
    case 'empty':
      return input.whenEmpty()
    case 'include':
      return createFromIncludedIds(
        input.domain,
        input.updateInclude(input.current.shape.ids, input.targetIds),
        readSnapshotContext(input.current, input.domainRevision)
      )
    case 'exclude':
      return createFromExcludedIds(
        input.domain,
        input.updateExclude(input.current.shape.ids, input.targetIds),
        readSnapshotContext(input.current, input.domainRevision)
      )
  }
}

const countInScope = <TId,>(
  domain: OrderedSelectionDomain<TId>,
  snapshot: SelectionSnapshot<TId>,
  scope?: SelectionScope<TId>
) => {
  if (!scope) {
    return snapshot.selectedCount
  }

  if (!snapshot.selectedCount || !scope.count) {
    return 0
  }

  switch (snapshot.shape.kind) {
    case 'empty':
      return 0
    case 'include': {
      if (scope.count < snapshot.shape.ids.size) {
        let count = 0
        for (const id of scope.iterate()) {
          if (!snapshot.shape.ids.has(id)) {
            continue
          }
          count += 1
        }
        return count
      }

      let count = 0
      for (const id of snapshot.shape.ids) {
        if (!scope.has(id)) {
          continue
        }
        count += 1
      }
      return count
    }
    case 'exclude': {
      if (!snapshot.shape.ids.size) {
        return scope.count
      }

      if (scope.count < snapshot.shape.ids.size) {
        let count = 0
        for (const id of scope.iterate()) {
          if (snapshot.shape.ids.has(id) || !domain.has(id)) {
            continue
          }

          count += 1
        }
        return count
      }

      let excluded = 0
      for (const id of snapshot.shape.ids) {
        if (!scope.has(id)) {
          continue
        }
        excluded += 1
      }
      return Math.max(0, scope.count - excluded)
    }
  }
}

function* iterateSelection<TId>(
  domain: OrderedSelectionDomain<TId>,
  snapshot: SelectionSnapshot<TId>,
  scope?: SelectionScope<TId>
): Iterable<TId> {
  if (!snapshot.selectedCount) {
    return
  }

  const source = scope
    ? scope.iterate()
    : domain.iterate()

  switch (snapshot.shape.kind) {
    case 'empty':
      return
    case 'include':
      for (const id of source) {
        if (!snapshot.shape.ids.has(id)) {
          continue
        }

        yield id
      }
      return
    case 'exclude':
      for (const id of source) {
        if (!domain.has(id) || snapshot.shape.ids.has(id)) {
          continue
        }

        yield id
      }
      return
  }
}

export const selectionSnapshot = {
  equal: <TId,>(
    left: SelectionSnapshot<TId>,
    right: SelectionSnapshot<TId>
  ) => left.selectedCount === right.selectedCount
    && left.domainRevision === right.domainRevision
    && left.anchor === right.anchor
    && left.focus === right.focus
    && sameShape(left.shape, right.shape),
  empty: <TId,>(
    domainRevision = 0
  ): SelectionSnapshot<TId> => ({
    shape: {
      kind: 'empty'
    },
    selectedCount: 0,
    domainRevision
  }),
  contains: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    snapshot: SelectionSnapshot<TId>,
    id: TId
  ) => {
    if (!domain || !snapshot.selectedCount) {
      return false
    }

    return shapeContains(domain, snapshot.shape, id)
  },
  first: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    snapshot: SelectionSnapshot<TId>
  ) => {
    if (!domain || !snapshot.selectedCount) {
      return undefined
    }

    return firstSelected(domain, snapshot.shape)
  },
  last: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    snapshot: SelectionSnapshot<TId>
  ) => {
    if (!domain || !snapshot.selectedCount) {
      return undefined
    }

    return lastSelected(domain, snapshot.shape)
  },
  primary: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    snapshot: SelectionSnapshot<TId>
  ) => {
    if (!domain || !snapshot.selectedCount) {
      return undefined
    }

    return snapshot.focus && domain.has(snapshot.focus)
      ? snapshot.focus
      : firstSelected(domain, snapshot.shape)
  },
  count: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    snapshot: SelectionSnapshot<TId>,
    scope?: SelectionScope<TId>
  ) => {
    if (!domain || !snapshot.selectedCount) {
      return 0
    }

    return countInScope(domain, snapshot, scope)
  },
  summary: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    snapshot: SelectionSnapshot<TId>,
    scope?: SelectionScope<TId>
  ): SelectionSummary => {
    const selected = selectionSnapshot.count(domain, snapshot, scope)
    if (!selected) {
      return 'none'
    }

    const total = scope
      ? scope.count
      : domain?.count ?? 0
    if (selected >= total && total > 0) {
      return 'all'
    }

    return 'some'
  },
  iterate: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    snapshot: SelectionSnapshot<TId>,
    scope?: SelectionScope<TId>
  ): Iterable<TId> => {
    if (!domain || !snapshot.selectedCount) {
      return [] as const
    }

    return iterateSelection(domain, snapshot, scope)
  },
  materialize: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    snapshot: SelectionSnapshot<TId>,
    scope?: SelectionScope<TId>
  ): readonly TId[] => [
    ...selectionSnapshot.iterate(domain, snapshot, scope)
  ],
  replaceIds: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    ids: Iterable<TId>,
    domainRevision: number,
    options?: {
      anchor?: TId
      focus?: TId
    }
  ) => createFromIncludedIds(
    domain,
    collectValidIds(domain, ids),
    {
      domainRevision,
      anchor: options?.anchor,
      focus: options?.focus
    }
  ),
  addIds: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    ids: Iterable<TId>,
    domainRevision: number
  ) => {
    const targetIds = collectValidIds(domain, ids)
    if (!targetIds.size) {
      return selectionSnapshot.rebase(domain, current, domainRevision)
    }

    return updateSnapshotIds({
      domain,
      current,
      domainRevision,
      targetIds,
      whenEmpty: () => createFromIncludedIds(
        domain,
        targetIds,
        readSnapshotContext(current, domainRevision)
      ),
      updateInclude: (ids, nextIds) => setCore.addAll(ids, nextIds),
      updateExclude: (ids, nextIds) => setCore.removeAll(ids, nextIds)
    })
  },
  removeIds: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    ids: Iterable<TId>,
    domainRevision: number
  ) => {
    const targetIds = collectValidIds(domain, ids)
    if (!targetIds.size || !current.selectedCount) {
      return selectionSnapshot.rebase(domain, current, domainRevision)
    }

    return updateSnapshotIds({
      domain,
      current,
      domainRevision,
      targetIds,
      whenEmpty: () => selectionSnapshot.empty<TId>(domainRevision),
      updateInclude: (ids, nextIds) => setCore.removeAll(ids, nextIds),
      updateExclude: (ids, nextIds) => setCore.addAll(ids, nextIds)
    })
  },
  toggleIds: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    ids: Iterable<TId>,
    domainRevision: number
  ) => {
    const targetIds = collectValidIds(domain, ids)
    if (!targetIds.size) {
      return selectionSnapshot.rebase(domain, current, domainRevision)
    }

    return updateSnapshotIds({
      domain,
      current,
      domainRevision,
      targetIds,
      whenEmpty: () => createFromIncludedIds(
        domain,
        targetIds,
        readSnapshotContext(current, domainRevision)
      ),
      updateInclude: (ids, nextIds) => setCore.toggleAll(ids, nextIds),
      updateExclude: (ids, nextIds) => setCore.toggleAll(ids, nextIds)
    })
  },
  replaceScope: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    scope: SelectionScope<TId>,
    domainRevision: number,
    options?: {
      anchor?: TId
      focus?: TId
    }
  ) => selectionSnapshot.replaceIds(
    domain,
    scope.iterate(),
    domainRevision,
    options
  ),
  addScope: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    scope: SelectionScope<TId>,
    domainRevision: number
  ) => selectionSnapshot.addIds(
    domain,
    current,
    scope.iterate(),
    domainRevision
  ),
  removeScope: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    scope: SelectionScope<TId>,
    domainRevision: number
  ) => selectionSnapshot.removeIds(
    domain,
    current,
    scope.iterate(),
    domainRevision
  ),
  toggleScope: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    scope: SelectionScope<TId>,
    domainRevision: number
  ) => (
    selectionSnapshot.summary(domain, current, scope) === 'all'
      ? selectionSnapshot.removeScope(domain, current, scope, domainRevision)
      : selectionSnapshot.addScope(domain, current, scope, domainRevision)
  ),
  extendTo: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    to: TId,
    domainRevision: number
  ) => {
    if (!domain.has(to)) {
      return selectionSnapshot.rebase(domain, current, domainRevision)
    }

    const anchor = current.anchor && domain.has(current.anchor)
      ? current.anchor
      : current.focus && domain.has(current.focus)
        ? current.focus
        : selectionSnapshot.first(domain, current)
          ?? to

    return selectionSnapshot.replaceIds(
      domain,
      domain.range(anchor, to),
      domainRevision,
      {
        anchor,
        focus: to
      }
    )
  },
  step: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    delta: number,
    domainRevision: number,
    options?: {
      extend?: boolean
    }
  ) => {
    if (!domain.count || delta === 0) {
      return undefined
    }

    const currentId = current.focus && domain.has(current.focus)
      ? current.focus
      : selectionSnapshot.first(domain, current)
        ?? domain.at(0)
    if (currentId === undefined) {
      return undefined
    }

    const currentIndex = domain.indexOf(currentId)
    if (currentIndex === undefined) {
      return undefined
    }

    const nextId = domain.at(currentIndex + delta)
    if (nextId === undefined) {
      return undefined
    }

    return options?.extend
      ? selectionSnapshot.extendTo(domain, current, nextId, domainRevision)
      : selectionSnapshot.replaceIds(
          domain,
          [nextId],
          domainRevision,
          {
            anchor: nextId,
            focus: nextId
          }
        )
  },
  applyIds: <TId,>(
    domain: OrderedSelectionDomain<TId>,
    current: SelectionSnapshot<TId>,
    ids: Iterable<TId>,
    mode: SelectionApplyMode,
    domainRevision: number,
    options?: {
      anchor?: TId
      focus?: TId
    }
  ) => {
    switch (mode) {
      case 'toggle':
        return selectionSnapshot.toggleIds(domain, current, ids, domainRevision)
      case 'add':
        return selectionSnapshot.addIds(domain, current, ids, domainRevision)
      case 'replace':
      default:
        return selectionSnapshot.replaceIds(domain, ids, domainRevision, options)
    }
  },
  rebase: <TId,>(
    domain: OrderedSelectionDomain<TId> | undefined,
    current: SelectionSnapshot<TId>,
    domainRevision: number
  ) => {
    if (!domain) {
      return selectionSnapshot.empty<TId>(domainRevision)
    }

    switch (current.shape.kind) {
      case 'empty':
        return selectionSnapshot.empty<TId>(domainRevision)
      case 'include': {
        const nextIds = new Set<TId>()
        current.shape.ids.forEach(id => {
          if (domain.has(id)) {
            nextIds.add(id)
          }
        })
        return createFromIncludedIds(domain, nextIds, {
          domainRevision,
          anchor: current.anchor,
          focus: current.focus
        })
      }
      case 'exclude': {
        const nextIds = new Set<TId>()
        current.shape.ids.forEach(id => {
          if (domain.has(id)) {
            nextIds.add(id)
          }
        })
        return createFromExcludedIds(domain, nextIds, {
          domainRevision,
          anchor: current.anchor,
          focus: current.focus
        })
      }
    }
  }
} as const
