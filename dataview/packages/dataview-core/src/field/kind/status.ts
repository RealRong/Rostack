import type {
  CustomField,
  StatusField,
  StatusOption,
  StatusCategory
} from '@dataview/core/types'
import {
  readFieldOptionEntity,
  readFieldOptionIds,
  readFieldOptionIndex,
  normalizeOptionToken,
} from '@dataview/core/field/option'
import {
  compare
} from '@shared/core'

export const STATUS_CATEGORIES = [
  'todo',
  'in_progress',
  'complete'
] as const satisfies readonly StatusCategory[]

export interface StatusSection {
  category: StatusCategory
  options: StatusOption[]
}

type StatusFieldInput = CustomField | undefined

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  complete: 'Complete'
}

const CATEGORY_COLORS: Record<StatusCategory, string> = {
  todo: 'gray',
  in_progress: 'blue',
  complete: 'green'
}

const DEFAULT_STATUS_OPTIONS = [
  {
    id: 'not_started',
    name: 'Not started',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'in_progress',
    name: 'In progress',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'done',
    name: 'Done',
    color: 'green',
    category: 'complete'
  }
] as const satisfies readonly StatusOption[]

const CATEGORY_ALIASES: Record<StatusCategory, readonly string[]> = {
  todo: ['todo', 'to do', 'not_started', 'not started', 'backlog', 'waiting', 'pending', 'planned', '待办', '未开始'],
  in_progress: ['in_progress', 'in progress', 'doing', 'active', 'progress', 'processing', '进行中', '处理中'],
  complete: ['complete', 'completed', 'done', 'finished', 'closed', '已完成', '完成']
}

const getStatusOptions = (
  field?: StatusFieldInput
) => field?.kind === 'status'
  ? readFieldOptionIds(field).flatMap((optionId) => {
      const option = readFieldOptionEntity(field, optionId)
      return option?.category !== undefined
        ? [option]
        : []
    })
  : []

const getStatusExplicitDefaultOptionId = (
  field: StatusFieldInput | undefined
) => {
  if (field?.kind !== 'status' || typeof field.defaultOptionId !== 'string') {
    return null
  }

  const normalized = field.defaultOptionId.trim()
  return normalized || null
}

const isGroupStatusCategory = (
  value: unknown
): value is StatusCategory => (
  typeof value === 'string'
  && STATUS_CATEGORIES.includes(value as StatusCategory)
)

const inferCategoryFromText = (
  values: readonly unknown[]
): StatusCategory | undefined => {
  const normalized = values
    .map(normalizeOptionToken)
    .filter((value): value is string => Boolean(value))

  for (const category of STATUS_CATEGORIES) {
    const aliases = CATEGORY_ALIASES[category]
    if (normalized.some(token => aliases.includes(token))) {
      return category
    }
  }

  return undefined
}

export const createDefaultStatusOptions = (): StatusOption[] => (
  DEFAULT_STATUS_OPTIONS.map(option => ({ ...option }))
)

export const getStatusCategoryLabel = (
  category: StatusCategory
) => CATEGORY_LABELS[category]

export const getStatusCategoryColor = (
  category: StatusCategory
) => CATEGORY_COLORS[category]

export const getStatusCategoryOrder = (
  category: unknown
) => {
  const index = STATUS_CATEGORIES.findIndex(item => item === category)
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER
}

export const getStatusOptionCategory = (
  field: StatusFieldInput | undefined,
  optionId: unknown
): StatusCategory | undefined => {
  const option = readFieldOptionEntity(field, optionId)
  if (!option) {
    return undefined
  }

  if (isGroupStatusCategory(option.category)) {
    return option.category
  }

  const inferred = inferCategoryFromText([option.id, option.name])
  if (inferred) {
    return inferred
  }

  return 'todo'
}

export const getStatusSections = (
  field?: StatusFieldInput
): StatusSection[] => {
  const options = getStatusOptions(field)

  return STATUS_CATEGORIES.map(category => ({
    category,
    options: options.filter(option => getStatusOptionCategory(field, option.id) === category)
  }))
}

export const getStatusDefaultOption = (
  field: StatusFieldInput | undefined,
  category: StatusCategory
) => getStatusSections(field)
  .find(section => section.category === category)
  ?.options[0]

export const getStatusFieldDefaultOption = (
  field: StatusFieldInput | undefined
) => {
  const explicitDefaultId = getStatusExplicitDefaultOptionId(field)
  if (explicitDefaultId) {
    const explicitDefault = readFieldOptionEntity(field, explicitDefaultId)
    if (explicitDefault) {
      return explicitDefault
    }
  }

  return getStatusDefaultOption(field, 'todo') ?? getStatusOptions(field)[0]
}

export const compareStatusFieldValues = (
  field: StatusFieldInput | undefined,
  left: unknown,
  right: unknown
) => {
  const readComparable = (value: unknown) => {
    if (typeof value !== 'string') {
      return {
        missing: 1,
        categoryOrder: Number.MAX_SAFE_INTEGER,
        optionOrder: Number.MAX_SAFE_INTEGER,
        label: String(value ?? '')
      }
    }

    const option = readFieldOptionEntity(field, value)
    if (!option) {
      return {
        missing: 1,
        categoryOrder: Number.MAX_SAFE_INTEGER,
        optionOrder: Number.MAX_SAFE_INTEGER,
        label: value
      }
    }

    return {
      missing: 0,
      categoryOrder: getStatusCategoryOrder(getStatusOptionCategory(field, option.id) ?? 'todo'),
      optionOrder: readFieldOptionIndex(field, option.id) ?? Number.MAX_SAFE_INTEGER,
      label: option.name
    }
  }

  const leftValue = readComparable(left)
  const rightValue = readComparable(right)
  if (leftValue.missing !== rightValue.missing) {
    return leftValue.missing - rightValue.missing
  }
  if (leftValue.categoryOrder !== rightValue.categoryOrder) {
    return leftValue.categoryOrder - rightValue.categoryOrder
  }
  if (leftValue.optionOrder !== rightValue.optionOrder) {
    return leftValue.optionOrder - rightValue.optionOrder
  }

  return compare.compareText(leftValue.label, rightValue.label)
}
