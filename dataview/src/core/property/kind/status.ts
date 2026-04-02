import type {
  GroupProperty,
  GroupPropertyOption,
  GroupStatusCategory
} from '@dataview/core/contracts'

export const GROUP_STATUS_CATEGORIES = [
  'todo',
  'in_progress',
  'complete'
] as const satisfies readonly GroupStatusCategory[]

export interface GroupStatusSection {
  category: GroupStatusCategory
  options: GroupPropertyOption[]
}

export interface GroupStatusFilterTarget {
  kind: 'category' | 'option'
  value: string
}

export interface GroupStatusFilterValue {
  targets: GroupStatusFilterTarget[]
}

type StatusProperty = Pick<GroupProperty, 'kind' | 'config'>

const CATEGORY_LABELS: Record<GroupStatusCategory, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  complete: 'Complete'
}

const CATEGORY_COLORS: Record<GroupStatusCategory, string> = {
  todo: 'gray',
  in_progress: 'blue',
  complete: 'green'
}

const DEFAULT_STATUS_OPTIONS = [
  {
    id: 'not_started',
    key: 'not_started',
    name: 'Not started',
    color: 'gray',
    category: 'todo'
  },
  {
    id: 'in_progress',
    key: 'in_progress',
    name: 'In progress',
    color: 'blue',
    category: 'in_progress'
  },
  {
    id: 'done',
    key: 'done',
    name: 'Done',
    color: 'green',
    category: 'complete'
  }
] as const satisfies readonly GroupPropertyOption[]

const CATEGORY_ALIASES: Record<GroupStatusCategory, readonly string[]> = {
  todo: ['todo', 'to do', 'not_started', 'not started', 'backlog', 'waiting', 'pending', 'planned', '待办', '未开始'],
  in_progress: ['in_progress', 'in progress', 'doing', 'active', 'progress', 'processing', '进行中', '处理中'],
  complete: ['complete', 'completed', 'done', 'finished', 'closed', '已完成', '完成']
}

const normalizeToken = (value: unknown) => String(value ?? '')
  .trim()
  .toLowerCase()

const getStatusOptions = (
  property?: StatusProperty
) => (
  property?.kind === 'status'
  && property.config?.type === 'status'
  && Array.isArray(property.config.options)
)
  ? property.config.options
  : []

const isGroupStatusCategory = (
  value: unknown
): value is GroupStatusCategory => (
  typeof value === 'string'
  && GROUP_STATUS_CATEGORIES.includes(value as GroupStatusCategory)
)

const inferCategoryFromText = (
  values: readonly unknown[]
): GroupStatusCategory | undefined => {
  const normalized = values
    .map(normalizeToken)
    .filter(Boolean)

  for (const category of GROUP_STATUS_CATEGORIES) {
    const aliases = CATEGORY_ALIASES[category]
    if (normalized.some(token => aliases.includes(token))) {
      return category
    }
  }

  return undefined
}

const getStatusOptionRecord = (
  property: StatusProperty | undefined,
  optionId: unknown
) => {
  if (typeof optionId !== 'string') {
    return undefined
  }

  return getStatusOptions(property).find(option => option.id === optionId)
}

const sortOptionTargets = (
  property: StatusProperty | undefined,
  targets: readonly GroupStatusFilterTarget[]
) => {
  const optionOrder = new Map(getStatusOptions(property).map((option, index) => [option.id, index]))

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

export const createDefaultStatusOptions = (): GroupPropertyOption[] => (
  DEFAULT_STATUS_OPTIONS.map(option => ({ ...option }))
)

export const getStatusCategoryLabel = (
  category: GroupStatusCategory
) => CATEGORY_LABELS[category]

export const getStatusCategoryColor = (
  category: GroupStatusCategory
) => CATEGORY_COLORS[category]

export const getStatusCategoryOrder = (
  category: unknown
) => {
  const index = GROUP_STATUS_CATEGORIES.findIndex(item => item === category)
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER
}

export const getStatusOptionCategory = (
  property: StatusProperty | undefined,
  optionId: unknown
): GroupStatusCategory | undefined => {
  const option = getStatusOptionRecord(property, optionId)
  if (!option) {
    return undefined
  }

  if (isGroupStatusCategory(option.category)) {
    return option.category
  }

  const inferred = inferCategoryFromText([option.id, option.key, option.name])
  if (inferred) {
    return inferred
  }

  return 'todo'
}

export const getStatusSections = (
  property?: StatusProperty
): GroupStatusSection[] => {
  const options = getStatusOptions(property)

  return GROUP_STATUS_CATEGORIES.map(category => ({
    category,
    options: options.filter(option => getStatusOptionCategory(property, option.id) === category)
  }))
}

export const getStatusDefaultOption = (
  property: StatusProperty | undefined,
  category: GroupStatusCategory
) => getStatusSections(property)
  .find(section => section.category === category)
  ?.options[0]

export const createEmptyStatusFilterValue = (): GroupStatusFilterValue => ({
  targets: []
})

export const isStatusFilterTarget = (
  value: unknown
): value is GroupStatusFilterTarget => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const target = value as Partial<GroupStatusFilterTarget>
  return (
    (target.kind === 'category' || target.kind === 'option')
    && typeof target.value === 'string'
    && target.value.trim().length > 0
  )
}

export const isStatusFilterValue = (
  value: unknown
): value is GroupStatusFilterValue => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const filterValue = value as Partial<GroupStatusFilterValue>
  return Array.isArray(filterValue.targets)
}

export const normalizeStatusFilterTargets = (
  property: StatusProperty | undefined,
  input: readonly GroupStatusFilterTarget[]
): GroupStatusFilterTarget[] => {
  const categorySet = new Set<GroupStatusCategory>()
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
    const category = getStatusOptionCategory(property, optionId)
    if (category && categorySet.has(category)) {
      optionSet.delete(optionId)
    }
  }

  getStatusSections(property).forEach(section => {
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

  const normalized: GroupStatusFilterTarget[] = [
    ...GROUP_STATUS_CATEGORIES
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

  return sortOptionTargets(property, normalized)
}

export const readStatusFilterValue = (
  property: StatusProperty | undefined,
  value: unknown
): GroupStatusFilterValue => {
  if (isStatusFilterValue(value)) {
    return {
      targets: normalizeStatusFilterTargets(
        property,
        value.targets.filter(isStatusFilterTarget)
      )
    }
  }

  if (Array.isArray(value)) {
    return {
      targets: normalizeStatusFilterTargets(
        property,
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
      targets: normalizeStatusFilterTargets(property, [{
        kind: 'option',
        value: value.trim()
      }])
    }
  }

  return createEmptyStatusFilterValue()
}

export const isStatusFilterEffective = (
  property: StatusProperty | undefined,
  value: unknown
) => readStatusFilterValue(property, value).targets.length > 0

export const isStatusFilterCategorySelected = (
  property: StatusProperty | undefined,
  value: unknown,
  category: GroupStatusCategory
) => readStatusFilterValue(property, value).targets.some(target => (
  target.kind === 'category' && target.value === category
))

export const isStatusFilterOptionSelected = (
  property: StatusProperty | undefined,
  value: unknown,
  optionId: string
) => {
  const filterValue = readStatusFilterValue(property, value)
  const category = getStatusOptionCategory(property, optionId)

  return filterValue.targets.some(target => (
    target.kind === 'option'
      ? target.value === optionId
      : category !== undefined && target.value === category
  ))
}

export const toggleStatusFilterCategory = (
  property: StatusProperty | undefined,
  value: unknown,
  category: GroupStatusCategory
): GroupStatusFilterValue => {
  const current = readStatusFilterValue(property, value).targets
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

          return getStatusOptionCategory(property, target.value) !== category
        }),
        {
          kind: 'category' as const,
          value: category
        }
      ]

  return {
    targets: normalizeStatusFilterTargets(property, nextTargets)
  }
}

export const toggleStatusFilterOption = (
  property: StatusProperty | undefined,
  value: unknown,
  optionId: string
): GroupStatusFilterValue => {
  const current = readStatusFilterValue(property, value).targets
  const category = getStatusOptionCategory(property, optionId)
  if (!category) {
    return {
      targets: normalizeStatusFilterTargets(property, current)
    }
  }

  const hasCategory = current.some(target => (
    target.kind === 'category' && target.value === category
  ))
  if (hasCategory) {
    const section = getStatusSections(property).find(item => item.category === category)
    const explicitTargets = section?.options
      .filter(option => option.id !== optionId)
      .map(option => ({
        kind: 'option' as const,
        value: option.id
      })) ?? []

    return {
      targets: normalizeStatusFilterTargets(
        property,
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
      property,
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
  property: StatusProperty | undefined,
  target: GroupStatusFilterTarget
) => {
  if (target.kind === 'category' && isGroupStatusCategory(target.value)) {
    return getStatusCategoryLabel(target.value)
  }

  return getStatusOptionRecord(property, target.value)?.name ?? target.value
}

export const matchStatusFilter = (
  property: StatusProperty | undefined,
  value: unknown,
  expected: unknown
) => {
  if (typeof value !== 'string') {
    return false
  }

  const targets = readStatusFilterValue(property, expected).targets
  if (!targets.length) {
    return false
  }

  const actualCategory = getStatusOptionCategory(property, value)
  return targets.some(target => (
    target.kind === 'option'
      ? target.value === value
      : actualCategory !== undefined && target.value === actualCategory
  ))
}

export const compareStatusPropertyValues = (
  property: StatusProperty | undefined,
  left: unknown,
  right: unknown
) => {
  const compareTuple = (value: unknown) => {
    if (typeof value !== 'string') {
      return [1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, String(value ?? '')] as const
    }

    const option = getStatusOptionRecord(property, value)
    if (!option) {
      return [1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, value] as const
    }

    const category = getStatusOptionCategory(property, option.id) ?? 'todo'
    const optionOrder = getStatusOptions(property).findIndex(item => item.id === option.id)
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
