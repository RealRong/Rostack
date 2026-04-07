import type {
  CustomField,
  StatusField,
  StatusOption,
  StatusCategory
} from '@dataview/core/contracts'

export const STATUS_CATEGORIES = [
  'todo',
  'in_progress',
  'complete'
] as const satisfies readonly StatusCategory[]

export interface StatusSection {
  category: StatusCategory
  options: StatusOption[]
}

export interface StatusFilterTarget {
  kind: 'category' | 'option'
  value: string
}

export interface StatusFilterValue {
  targets: StatusFilterTarget[]
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

const normalizeToken = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()

const getStatusOptions = (
  field?: StatusFieldInput
) => (
  field?.kind === 'status' && Array.isArray(field.options)
)
  ? field.options
  : []

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
    .map(normalizeToken)
    .filter(Boolean)

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

const sortOptionTargets = (
  field: StatusFieldInput | undefined,
  targets: readonly StatusFilterTarget[]
) => {
  const optionOrder = new Map(getStatusOptions(field).map((option, index) => [option.id, index]))

  return [...targets].sort((left, right) => {
    if (left.kind === 'category' && right.kind === 'option') {
      return -1
    }
    if (left.kind === 'option' && right.kind === 'category') {
      return 1
    }
    if (left.kind === 'category' && right.kind === 'category') {
      return getStatusCategoryOrder(left.value) - getStatusCategoryOrder(right.value)
    }

    const leftOptionOrder = optionOrder.get(left.value)
    const rightOptionOrder = optionOrder.get(right.value)
    if (leftOptionOrder !== undefined && rightOptionOrder !== undefined) {
      return leftOptionOrder - rightOptionOrder
    }
    if (leftOptionOrder !== undefined) {
      return -1
    }
    if (rightOptionOrder !== undefined) {
      return 1
    }

    return left.value.localeCompare(right.value)
  })
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

export const createEmptyStatusFilterValue = (): StatusFilterValue => ({
  targets: []
})

export const isStatusFilterTarget = (
  value: unknown
): value is StatusFilterTarget => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const target = value as Partial<StatusFilterTarget>
  return (
    (target.kind === 'category' || target.kind === 'option')
    && typeof target.value === 'string'
    && target.value.trim().length > 0
  )
}

export const isStatusFilterValue = (
  value: unknown
): value is StatusFilterValue => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const filterValue = value as Partial<StatusFilterValue>
  return Array.isArray(filterValue.targets)
}

export const normalizeStatusFilterTargets = (
  field: StatusFieldInput | undefined,
  input: readonly StatusFilterTarget[]
): StatusFilterTarget[] => {
  const categorySet = new Set<StatusCategory>()
  const optionSet = new Set<string>()

  input.forEach(target => {
    if (target.kind === 'category' && isGroupStatusCategory(target.value)) {
      categorySet.add(target.value)
      return
    }

    if (target.kind === 'option' && target.value.trim()) {
      optionSet.add(target.value.trim())
    }
  })

  for (const optionId of [...optionSet]) {
    const category = getStatusOptionCategory(field, optionId)
    if (category && categorySet.has(category)) {
      optionSet.delete(optionId)
    }
  }

  getStatusSections(field).forEach(section => {
    if (categorySet.has(section.category) || section.options.length === 0) {
      return
    }

    const allSelected = section.options.every(option => optionSet.has(option.id))
    if (!allSelected) {
      return
    }

    categorySet.add(section.category)
    section.options.forEach(option => {
      optionSet.delete(option.id)
    })
  })

  const normalized: StatusFilterTarget[] = [
    ...STATUS_CATEGORIES
      .filter(category => categorySet.has(category))
      .map(category => ({
        kind: 'category' as const,
        value: category
      })),
    ...[...optionSet].map(optionId => ({
      kind: 'option' as const,
      value: optionId
    }))
  ]

  return sortOptionTargets(field, normalized)
}

export const readStatusFilterValue = (
  field: StatusFieldInput | undefined,
  value: unknown
): StatusFilterValue => {
  if (isStatusFilterValue(value)) {
    return {
      targets: normalizeStatusFilterTargets(
        field,
        value.targets.filter(isStatusFilterTarget)
      )
    }
  }

  if (Array.isArray(value)) {
    return {
      targets: normalizeStatusFilterTargets(
        field,
        value
          .filter(item => typeof item === 'string')
          .map(item => ({
            kind: 'option' as const,
            value: item
          }))
      )
    }
  }

  if (typeof value === 'string' && value.trim()) {
    return {
      targets: normalizeStatusFilterTargets(field, [{
        kind: 'option',
        value: value.trim()
      }])
    }
  }

  return createEmptyStatusFilterValue()
}

export const isStatusFilterEffective = (
  field: StatusFieldInput | undefined,
  value: unknown
) => readStatusFilterValue(field, value).targets.length > 0

export const isStatusFilterCategorySelected = (
  field: StatusFieldInput | undefined,
  value: unknown,
  category: StatusCategory
) => readStatusFilterValue(field, value).targets.some(target => (
  target.kind === 'category' && target.value === category
))

export const isStatusFilterOptionSelected = (
  field: StatusFieldInput | undefined,
  value: unknown,
  optionId: string
) => {
  const filterValue = readStatusFilterValue(field, value)
  const category = getStatusOptionCategory(field, optionId)

  return filterValue.targets.some(target => (
    target.kind === 'option'
      ? target.value === optionId
      : category !== undefined && target.value === category
  ))
}

export const toggleStatusFilterCategory = (
  field: StatusFieldInput | undefined,
  value: unknown,
  category: StatusCategory
): StatusFilterValue => {
  const current = readStatusFilterValue(field, value).targets
  const hasCategory = current.some(target => (
    target.kind === 'category' && target.value === category
  ))

  const nextTargets = hasCategory
    ? current.filter(target => !(target.kind === 'category' && target.value === category))
    : [
        ...current.filter(target => {
          if (target.kind !== 'option') {
            return true
          }

          return getStatusOptionCategory(field, target.value) !== category
        }),
        {
          kind: 'category' as const,
          value: category
        }
      ]

  return {
    targets: normalizeStatusFilterTargets(field, nextTargets)
  }
}

export const toggleStatusFilterOption = (
  field: StatusFieldInput | undefined,
  value: unknown,
  optionId: string
): StatusFilterValue => {
  const current = readStatusFilterValue(field, value).targets
  const category = getStatusOptionCategory(field, optionId)
  if (!category) {
    return {
      targets: normalizeStatusFilterTargets(field, current)
    }
  }

  const hasCategory = current.some(target => (
    target.kind === 'category' && target.value === category
  ))
  if (hasCategory) {
    const section = getStatusSections(field).find(item => item.category === category)
    const explicitTargets = section?.options
      .filter(option => option.id !== optionId)
      .map(option => ({
        kind: 'option' as const,
        value: option.id
      })) ?? []

    return {
      targets: normalizeStatusFilterTargets(
        field,
        [
          ...current.filter(target => !(target.kind === 'category' && target.value === category)),
          ...explicitTargets
        ]
      )
    }
  }

  const hasOption = current.some(target => (
    target.kind === 'option' && target.value === optionId
  ))

  return {
    targets: normalizeStatusFilterTargets(
      field,
      hasOption
        ? current.filter(target => !(target.kind === 'option' && target.value === optionId))
        : [
            ...current,
            {
              kind: 'option' as const,
              value: optionId
            }
          ]
    )
  }
}

export const getStatusFilterTargetLabel = (
  field: StatusFieldInput | undefined,
  target: StatusFilterTarget
) => {
  if (target.kind === 'category' && isGroupStatusCategory(target.value)) {
    return getStatusCategoryLabel(target.value)
  }

  return getStatusOptionRecord(field, target.value)?.name ?? target.value
}

export const matchStatusFilter = (
  field: StatusFieldInput | undefined,
  value: unknown,
  expected: unknown
) => {
  if (typeof value !== 'string') {
    return false
  }

  const targets = readStatusFilterValue(field, expected).targets
  if (!targets.length) {
    return false
  }

  const actualCategory = getStatusOptionCategory(field, value)
  return targets.some(target => (
    target.kind === 'option'
      ? target.value === value
      : actualCategory !== undefined && target.value === actualCategory
  ))
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
    const optionOrder = getStatusOptions(field).findIndex(item => item.id === option.id)
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
