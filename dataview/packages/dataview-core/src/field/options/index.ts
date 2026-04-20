import type {
  FlatOption,
  MultiSelectField,
  CustomField,
  FieldOption,
  SelectField,
  StatusField,
  StatusOption
} from '@dataview/core/contracts'
import {
  hasFieldOptions
} from '@dataview/core/field/kind/spec'
import {
  createFieldKey
} from '@dataview/core/field/schema'
import {
  getFieldOptionSpec
} from '@dataview/core/field/options/spec'

const normalizeOptionToken = (value: string) => value.trim().toLowerCase()

const findFieldOptionByName = (
  options: readonly FieldOption[],
  name: string
) => {
  const normalizedName = normalizeOptionToken(name)
  if (!normalizedName) {
    return undefined
  }

  return options.find(option => normalizeOptionToken(option.name) === normalizedName)
}

const getFieldOptions = (
  field?: CustomField
): FieldOption[] => {
  if (!field || !hasFieldOptions(field)) {
    return []
  }

  return field.options
}

const findFieldOption = (
  field: CustomField | undefined,
  value: unknown
) => {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalizedValue = normalizeOptionToken(value)
  if (!field || !normalizedValue) {
    return undefined
  }

  return getFieldOptions(field).find(option => (
    normalizeOptionToken(option.id) === normalizedValue
    || normalizeOptionToken(option.name) === normalizedValue
  ))
}

const getFieldOption = (
  field: CustomField | undefined,
  optionId: unknown
) => {
  if (typeof optionId !== 'string' || !field) {
    return undefined
  }

  const normalizedId = optionId.trim()
  if (!normalizedId) {
    return undefined
  }

  return getFieldOptions(field).find(option => option.id === normalizedId)
}

const getFieldOptionTokens = (
  field: CustomField | undefined,
  optionId: unknown
) => {
  const option = getFieldOption(field, optionId)
  if (!option) {
    return typeof optionId === 'string' && optionId.trim() ? [optionId] : []
  }

  return option.name === option.id
    ? [option.id]
    : [option.name, option.id]
}

const getFieldOptionOrder = (
  field: CustomField | undefined,
  optionId: unknown
) => {
  if (!field || typeof optionId !== 'string') {
    return undefined
  }

  const index = getFieldOptions(field).findIndex(option => option.id === optionId)
  return index >= 0 ? index : undefined
}

const matchesFieldOptionValue = (
  field: CustomField | undefined,
  actual: unknown,
  expected: unknown
) => {
  if (typeof actual !== 'string' || typeof expected !== 'string') {
    return actual === expected
  }

  return getFieldOptionTokens(field, actual).some(token => (
    normalizeOptionToken(token) === normalizeOptionToken(expected)
  ))
}

const containsFieldOptionToken = (
  field: CustomField | undefined,
  value: unknown,
  expected: unknown
) => (
  typeof expected === 'string'
    && getFieldOptionTokens(field, value).some(token => (
      normalizeOptionToken(token).includes(normalizeOptionToken(expected))
    ))
)

const createUniqueFieldOptionToken = (
  options: readonly FieldOption[],
  name: string
) => {
  const baseToken = createFieldKey(name) || 'option'
  const usedTokens = new Set(options.map(option => option.id))

  let nextToken = baseToken
  let suffix = 2
  while (usedTokens.has(nextToken)) {
    nextToken = `${baseToken}_${suffix}`
    suffix += 1
  }

  return nextToken
}

const replaceFieldOptions = (
  field: CustomField,
  options: FieldOption[]
): Pick<SelectField, 'options'> | Pick<MultiSelectField, 'options'> | Pick<StatusField, 'options'> | {} => {
  switch (field.kind) {
    case 'select':
      return {
        options: options.map(option => ({
          id: option.id,
          name: option.name,
          color: option.color ?? null
        })) as FlatOption[]
      }
    case 'multiSelect':
      return {
        options: options.map(option => ({
          id: option.id,
          name: option.name,
          color: option.color ?? null
        })) as FlatOption[]
      }
    case 'status':
      return {
        options: options.flatMap(option => (
          'category' in option
            ? [{
                id: option.id,
                name: option.name,
                color: option.color ?? null,
                category: option.category
              } satisfies StatusOption]
            : []
        ))
      }
    default:
      return {}
  }
}
export type {
  FieldOptionSpec,
  FieldOptionWrite,
  OptionField
} from '@dataview/core/field/options/spec'

export const fieldOption = {
  spec: {
    get: getFieldOptionSpec
  },
  token: {
    normalize: normalizeOptionToken,
    create: createUniqueFieldOptionToken
  },
  read: {
    list: getFieldOptions,
    get: getFieldOption,
    find: findFieldOption,
    findByName: findFieldOptionByName,
    tokens: getFieldOptionTokens,
    order: getFieldOptionOrder
  },
  match: {
    equals: matchesFieldOptionValue,
    contains: containsFieldOptionToken
  },
  write: {
    replace: replaceFieldOptions
  }
} as const
