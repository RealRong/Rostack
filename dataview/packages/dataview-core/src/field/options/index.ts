import type {
  CustomField,
  FieldOption
} from '@dataview/core/types'
import {
  getKindSpec,
  type FieldOptionSpec,
  type FieldOptionWrite
} from '@dataview/core/field/kind/spec'
import {
  createFieldOptionId,
  findFieldOption,
  normalizeOptionToken,
  readFieldOption,
  readFieldOptionOrder,
  readFieldOptionTokens,
  readFieldOptions,
  replaceFieldOptions,
  type OptionField
} from '@dataview/core/field/option'

const getFieldOptionSpec = (
  field: OptionField
): FieldOptionSpec => getKindSpec(field.kind).option!

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

export type {
  FieldOptionSpec,
  FieldOptionWrite,
  OptionField
}

export const fieldOption = {
  spec: {
    get: getFieldOptionSpec
  },
  token: {
    normalize: (value: unknown) => normalizeOptionToken(value) ?? '',
    create: createFieldOptionId
  },
  read: {
    list: readFieldOptions,
    get: readFieldOption,
    find: findFieldOption,
    findByName: findFieldOptionByName,
    tokens: readFieldOptionTokens,
    order: readFieldOptionOrder
  },
  match: {
    equals: (
      field: CustomField | undefined,
      actual: unknown,
      expected: unknown
    ) => {
      if (typeof actual !== 'string' || typeof expected !== 'string') {
        return actual === expected
      }

      const normalizedExpected = normalizeOptionToken(expected)
      return normalizedExpected !== undefined
        && readFieldOptionTokens(field, actual).some(token => normalizeOptionToken(token) === normalizedExpected)
    },
    contains: (
      field: CustomField | undefined,
      value: unknown,
      expected: unknown
    ) => {
      const normalizedExpected = normalizeOptionToken(expected)
      return normalizedExpected !== undefined
        && readFieldOptionTokens(field, value).some(token => (
          normalizeOptionToken(token)?.includes(normalizedExpected) === true
        ))
    }
  },
  write: {
    replace: replaceFieldOptions
  }
} as const
