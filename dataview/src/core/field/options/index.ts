import type {
  GroupProperty,
  GroupPropertyConfig,
  GroupPropertyOption
} from '@dataview/core/contracts'
import {
  hasPropertyOptions
} from '../kind/spec'
import {
  createPropertyKey,
  getPropertyConfig
} from '../schema'

export const normalizeOptionToken = (value: string) => value.trim().toLowerCase()

export const findPropertyOptionByName = (
  options: readonly GroupPropertyOption[],
  name: string
) => {
  const normalizedName = normalizeOptionToken(name)
  if (!normalizedName) {
    return undefined
  }

  return options.find(option => normalizeOptionToken(option.name) === normalizedName)
}

export const getPropertyOptions = (
  property?: Pick<GroupProperty, 'kind' | 'config'>
): GroupPropertyOption[] => {
  if (!property || !hasPropertyOptions(property)) {
    return []
  }
  const config = getPropertyConfig(property)
  if (!('options' in config) || !Array.isArray(config.options)) {
    return []
  }

  return config.options
}

export const findPropertyOption = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  value: unknown
) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalizedValue = normalizeOptionToken(value)
  if (!property || !normalizedValue) {
    return undefined
  }

  return getPropertyOptions(property).find(option => (
    normalizeOptionToken(option.id) === normalizedValue
    || normalizeOptionToken(option.key) === normalizedValue
    || normalizeOptionToken(option.name) === normalizedValue
  ))
}

export const getPropertyOption = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  optionId: unknown
) => {
  if (typeof optionId !== 'string' || !property) {
    return undefined
  }

  const normalizedId = optionId.trim()
  if (!normalizedId) {
    return undefined
  }

  return getPropertyOptions(property).find(option => option.id === normalizedId)
}

export const getPropertyOptionTokens = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  optionId: unknown
) => {
  const option = getPropertyOption(property, optionId)
  if (!option) {
    return typeof optionId === 'string' && optionId.trim() ? [optionId] : []
  }

  return Array.from(new Set([option.name, option.key, option.id].filter(Boolean)))
}

export const getPropertyOptionOrder = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  optionId: unknown
) => {
  if (!property || typeof optionId !== 'string') {
    return undefined
  }

  const index = getPropertyOptions(property).findIndex(option => option.id === optionId)
  return index >= 0 ? index : undefined
}

export const matchesPropertyOptionValue = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  actual: unknown,
  expected: unknown
) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return actual === expected
  }

  return getPropertyOptionTokens(property, actual).some(token => (
    normalizeOptionToken(token) === normalizeOptionToken(expected)
  ))
}

export const containsPropertyOptionToken = (
  property: Pick<GroupProperty, 'kind' | 'config'> | undefined,
  value: unknown,
  expected: unknown
) => (
  typeof expected === 'string'
    && getPropertyOptionTokens(property, value).some(token => (
      normalizeOptionToken(token).includes(normalizeOptionToken(expected))
    ))
)

export const createUniquePropertyOptionToken = (
  options: readonly GroupPropertyOption[],
  name: string
) => {
  const baseToken = createPropertyKey(name) || 'option'
  const usedTokens = new Set(options.flatMap(option => [option.id, option.key]))

  let nextToken = baseToken
  let suffix = 2
  while (usedTokens.has(nextToken)) {
    nextToken = `${baseToken}_${suffix}`
    suffix += 1
  }

  return nextToken
}

export const replacePropertyOptions = (
  property: GroupProperty,
  options: GroupPropertyOption[]
): GroupPropertyConfig => {
  const config = getPropertyConfig(property)

  switch (config.type) {
    case 'select':
      return {
        ...config,
        options
      }
    case 'multiSelect':
      return {
        ...config,
        options
      }
    case 'status': {
      return {
        ...config,
        options
      }
    }
    default:
      return config
  }
}
