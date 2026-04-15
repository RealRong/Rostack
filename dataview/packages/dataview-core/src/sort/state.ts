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

export const add = (
  sorters: readonly Sorter[],
  fieldId: string,
  direction: SortDirection = 'asc'
): Sorter[] => {
  if (findSorterIndex(sorters, fieldId) !== -1) {
    return sorters as Sorter[]
  }

  return [
    ...cloneSorters(sorters),
    {
      field: fieldId,
      direction
    }
  ]
}

export const set = (
  sorters: readonly Sorter[],
  fieldId: string,
  direction: SortDirection
): Sorter[] => {
  const index = findSorterIndex(sorters, fieldId)

  if (index === -1) {
    return [
      ...cloneSorters(sorters),
      {
        field: fieldId,
        direction
      }
    ]
  }

  if (
    sorters[index]?.field === fieldId
    && sorters[index]?.direction === direction
  ) {
    return sorters as Sorter[]
  }

  const next = cloneSorters(sorters)
  next[index] = {
    field: fieldId,
    direction
  }
  return next
}

export const keepOnly = (
  sorters: readonly Sorter[],
  fieldId: string,
  direction: SortDirection
): Sorter[] => {
  if (
    sorters.length === 1
    && sorters[0]?.field === fieldId
    && sorters[0]?.direction === direction
  ) {
    return sorters as Sorter[]
  }

  return [{
    field: fieldId,
    direction
  }]
}

export const replace = (
  sorters: readonly Sorter[],
  index: number,
  sorter: Sorter
): Sorter[] => {
  if (!sorters[index]) {
    return sorters as Sorter[]
  }

  if (
    sorters[index]?.field === sorter.field
    && sorters[index]?.direction === sorter.direction
  ) {
    return sorters as Sorter[]
  }

  const next = cloneSorters(sorters)
  next[index] = cloneSorter(sorter)
  return next
}

export const remove = (
  sorters: readonly Sorter[],
  index: number
): Sorter[] => {
  if (index < 0 || index >= sorters.length) {
    return sorters as Sorter[]
  }

  const next = cloneSorters(sorters)
  next.splice(index, 1)
  return next
}

export const move = (
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
    return sorters as Sorter[]
  }

  const next = cloneSorters(sorters)
  const [sorter] = next.splice(from, 1)
  if (!sorter) {
    return sorters as Sorter[]
  }

  next.splice(to, 0, sorter)
  return next
}

export const clear = (
  sorters: readonly Sorter[]
): Sorter[] => (
  sorters.length
    ? []
    : sorters as Sorter[]
)

export const sort = {
  add,
  set,
  keepOnly,
  replace,
  remove,
  move,
  clear
} as const
