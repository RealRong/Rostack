import type { StatusCategory } from '@dataview/core/types'

export const buildStatusIdsAfterCategoryMove = (
  sections: readonly {
    category: StatusCategory
    options: readonly {
      id: string
    }[]
  }[],
  optionId: string,
  from: StatusCategory,
  to: StatusCategory
) => sections.flatMap(section => {
  const ids = section.options
    .map(option => option.id)
    .filter(id => id !== optionId)

  if (section.category === to) {
    return [...ids, optionId]
  }

  if (section.category === from) {
    return ids
  }

  return ids
})
