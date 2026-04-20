import type {
  FlatOption,
  CustomField,
  FieldOption,
  MultiSelectField,
  SelectField,
  StatusField,
  StatusOption
} from '@dataview/core/contracts'
import {
  createFieldKey
} from '@dataview/core/field/schema'

export type OptionField = Extract<CustomField, {
  kind: 'select' | 'multiSelect' | 'status'
}>

export type FieldOptionWrite =
  | {
      kind: 'keep'
    }
  | {
      kind: 'clear'
    }
  | {
      kind: 'set'
      value: unknown
    }

export interface FieldOptionSpec {
  createOption: (input: {
    field: OptionField
    options: readonly FieldOption[]
    name: string
  }) => FieldOption
  updateOption: (input: {
    field: OptionField
    option: FieldOption
    patch: {
      name?: string
      color?: string | null
      category?: StatusOption['category']
    }
  }) => FieldOption
  patchForRemove: (input: {
    field: OptionField
    options: readonly FieldOption[]
    optionId: string
  }) => Partial<Omit<CustomField, 'id'>>
  projectValueWithoutOption: (input: {
    field: OptionField
    value: unknown
    optionId: string
  }) => FieldOptionWrite
}

const KEEP_WRITE: FieldOptionWrite = Object.freeze({
  kind: 'keep'
})

const CLEAR_WRITE: FieldOptionWrite = Object.freeze({
  kind: 'clear'
})

const createUniqueOptionToken = (
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

const replaceOptions = (
  field: OptionField,
  options: FieldOption[]
): Pick<SelectField, 'options'> | Pick<MultiSelectField, 'options'> | Pick<StatusField, 'options'> => {
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
  }
}

const createOptionSpec = (input: {
  updateOption: FieldOptionSpec['updateOption']
  patchForRemove: FieldOptionSpec['patchForRemove']
  projectValueWithoutOption: FieldOptionSpec['projectValueWithoutOption']
}): FieldOptionSpec => ({
  createOption: ({ field, options, name }) => ({
    id: createUniqueOptionToken(options, name),
    name,
    color: null,
    ...(field.kind === 'status'
      ? {
          category: 'todo' as const
        }
      : {})
  }),
  updateOption: input.updateOption,
  patchForRemove: input.patchForRemove,
  projectValueWithoutOption: input.projectValueWithoutOption
})

const singleValueOptionSpec = createOptionSpec({
  updateOption: ({ field, option, patch }) => ({
    ...option,
    ...(patch.name !== undefined
      ? { name: patch.name }
      : {}),
    ...(patch.color !== undefined
      ? { color: patch.color }
      : {}),
    ...(field.kind === 'status' && patch.category !== undefined
      ? { category: patch.category }
      : {})
  }),
  patchForRemove: ({ field, options, optionId }) => ({
    ...replaceOptions(
      field,
      options.filter(option => option.id !== optionId)
    ),
    ...(field.kind === 'status' && field.defaultOptionId === optionId
      ? { defaultOptionId: null }
      : {})
  }) as Partial<Omit<CustomField, 'id'>>,
  projectValueWithoutOption: ({ value, optionId }) => (
    value === optionId
      ? CLEAR_WRITE
      : KEEP_WRITE
  )
})

const multiValueOptionSpec = createOptionSpec({
  updateOption: ({ option, patch }) => ({
    ...option,
    ...(patch.name !== undefined
      ? { name: patch.name }
      : {}),
    ...(patch.color !== undefined
      ? { color: patch.color }
      : {})
  }),
  patchForRemove: ({ field, options, optionId }) => replaceOptions(
    field,
    options.filter(option => option.id !== optionId)
  ) as Partial<Omit<CustomField, 'id'>>,
  projectValueWithoutOption: ({ value, optionId }) => {
    if (!Array.isArray(value)) {
      return KEEP_WRITE
    }

    const nextValue = value.filter(item => item !== optionId)
    if (nextValue.length === value.length) {
      return KEEP_WRITE
    }

    return nextValue.length
      ? {
          kind: 'set',
          value: nextValue
        }
      : CLEAR_WRITE
  }
})

const optionSpecsByKind = {
  select: singleValueOptionSpec,
  multiSelect: multiValueOptionSpec,
  status: singleValueOptionSpec
} as const satisfies Record<OptionField['kind'], FieldOptionSpec>

export const getFieldOptionSpec = (
  field: OptionField
): FieldOptionSpec => optionSpecsByKind[field.kind]
