import type {
  Field,
  FieldId,
  Sorter
} from '@dataview/core/contracts'

export const SORT_DIRECTIONS = [
  'asc',
  'desc'
] as const

export const getSorterFieldId = (
  sorter: Pick<Sorter, 'field'>
): FieldId | undefined => {
  if (typeof sorter.field !== 'string') {
    return undefined
  }

  return sorter.field
}

export const getSorterItemId = (
  sorter: Pick<Sorter, 'field'>,
  index: number
) => getSorterFieldId(sorter) ?? `sorter_${index}`

export const findSorterProperty = (
  fields: readonly Field[],
  sorter: Pick<Sorter, 'field'>
) => {
  const fieldId = getSorterFieldId(sorter)
  return fieldId
    ? fields.find(property => property.id === fieldId)
    : undefined
}

export const getAvailableSorterProperties = (
  fields: readonly Field[],
  sorters: readonly Sorter[]
) => {
  const usedFieldIds = new Set<FieldId>()

  sorters.forEach(sorter => {
    const fieldId = getSorterFieldId(sorter)
    if (fieldId) {
      usedFieldIds.add(fieldId)
    }
  })

  return fields.filter(property => !usedFieldIds.has(property.id))
}

export const getAvailableSorterPropertiesForIndex = (
  fields: readonly Field[],
  sorters: readonly Sorter[],
  index: number
) => {
  const currentFieldId = getSorterFieldId(sorters[index] ?? { field: undefined })
  const usedFieldIds = new Set<FieldId>()

  sorters.forEach((sorter, sorterIndex) => {
    if (sorterIndex === index) {
      return
    }

    const fieldId = getSorterFieldId(sorter)
    if (fieldId) {
      usedFieldIds.add(fieldId)
    }
  })

  return fields.filter(property => property.id === currentFieldId || !usedFieldIds.has(property.id))
}
