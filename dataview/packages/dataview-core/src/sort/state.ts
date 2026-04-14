import type {
  SortDirection,
  Sorter
} from '@dataview/core/contracts'

export const cloneSorter = (
  sorter: Sorter
): Sorter => ({
  field: sorter.field,
  direction: sorter.direction
})

export const cloneSorters = (
  sorters: readonly Sorter[]
): Sorter[] => sorters.map(cloneSorter)

export const normalizeSorter = (
  sorter: unknown
): Sorter | undefined => {
  if (typeof sorter !== 'object' || sorter === null) {
    return undefined
  }

  const source = sorter as {
    field?: unknown
    direction?: unknown
  }
  if (typeof source.field !== 'string') {
    return undefined
  }

  return {
    field: source.field,
    direction: source.direction === 'desc'
      ? 'desc'
      : 'asc'
  }
}

export const normalizeSorters = (
  sorters: unknown
): Sorter[] => (
  Array.isArray(sorters)
    ? sorters.flatMap(sorter => {
        const normalized = normalizeSorter(sorter)
        return normalized
          ? [normalized]
          : []
      })
    : []
)

export const sameSorters = (
  left: readonly Sorter[],
  right: readonly Sorter[]
) => (
  left.length === right.length
  && left.every((sorter, index) => (
    sorter.field === right[index]?.field
    && sorter.direction === right[index]?.direction
  ))
)

export const findSorterIndex = (
  sorters: readonly Sorter[],
  fieldId: string
) => sorters.findIndex(sorter => sorter.field === fieldId)

export const addSorter = (
  sorters: readonly Sorter[],
  fieldId: string,
  direction: SortDirection = 'asc'
): Sorter[] => {
  if (findSorterIndex(sorters, fieldId) !== -1) {
    return cloneSorters(sorters)
  }

  return [
    ...cloneSorters(sorters),
    {
      field: fieldId,
      direction
    }
  ]
}

export const setSorter = (
  sorters: readonly Sorter[],
  fieldId: string,
  direction: SortDirection
): Sorter[] => {
  const next = cloneSorters(sorters)
  const index = findSorterIndex(next, fieldId)

  if (index === -1) {
    next.push({
      field: fieldId,
      direction
    })
    return next
  }

  next[index] = {
    field: fieldId,
    direction
  }
  return next
}

export const setOnlySorter = (
  sorters: readonly Sorter[],
  fieldId: string,
  direction: SortDirection
): Sorter[] => {
  if (
    sorters.length === 1
    && sorters[0]?.field === fieldId
    && sorters[0]?.direction === direction
  ) {
    return cloneSorters(sorters)
  }

  return [{
    field: fieldId,
    direction
  }]
}

export const replaceSorter = (
  sorters: readonly Sorter[],
  index: number,
  sorter: Sorter
): Sorter[] => {
  if (!sorters[index]) {
    return cloneSorters(sorters)
  }

  const next = cloneSorters(sorters)
  next[index] = cloneSorter(sorter)
  return next
}

export const removeSorter = (
  sorters: readonly Sorter[],
  index: number
): Sorter[] => {
  if (index < 0 || index >= sorters.length) {
    return cloneSorters(sorters)
  }

  const next = cloneSorters(sorters)
  next.splice(index, 1)
  return next
}

export const moveSorter = (
  sorters: readonly Sorter[],
  from: number,
  to: number
): Sorter[] => {
  if (
    from < 0
    || from >= sorters.length
    || to < 0
    || to >= sorters.length
    || from === to
  ) {
    return cloneSorters(sorters)
  }

  const next = cloneSorters(sorters)
  const [sorter] = next.splice(from, 1)
  if (!sorter) {
    return next
  }

  next.splice(to, 0, sorter)
  return next
}

export const clearSorters = (
  sorters: readonly Sorter[]
): Sorter[] => (
  sorters.length
    ? []
    : cloneSorters(sorters)
)
