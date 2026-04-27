import type {
  CustomField,
  StatusField,
  StatusOption,
  StatusCategory
} from '@dataview/core/types'
import {
  normalizeOptionToken,
  readFieldOptionOrder
} from '@dataview/core/shared'

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
) => (
  field?.kind === 'status' && Array.isArray(field.options)
)
  ? field.options
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

const getStatusOptionRecord = (
  field: StatusFieldInput | undefined,
  optionId: unknown
) => {
  if (typeof optionId !== 'string') {
    return undefined
  }

  return getStatusOptions(field).find(option => option.id === optionId)
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
  const option = getStatusOptionRecord(field, optionId)
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
    const explicitDefault = getStatusOptionRecord(field, explicitDefaultId)
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
  const compareTuple = (value: unknown) => {
    if (typeof value !== 'string') {
      return [1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, String(value ?? '')] as const
    }

    const option = getStatusOptionRecord(field, value)
    if (!option) {
      return [1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, value] as const
    }

    const category = getStatusOptionCategory(field, option.id) ?? 'todo'
    const optionOrder = readFieldOptionOrder(field, option.id) ?? Number.MAX_SAFE_INTEGER
    return [0, getStatusCategoryOrder(category), optionOrder, option.name] as const
  }

  const leftTuple = compareTuple(left)
  const rightTuple = compareTuple(right)

  for (let index = 0; index < leftTuple.length; index += 1) {
    const leftValue = leftTuple[index]
    const rightValue = rightTuple[index]
    if (leftValue === rightValue) {
      continue
    }

    return leftValue > rightValue ? 1 : -1
  }

  return 0
}
