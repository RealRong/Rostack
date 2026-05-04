import type {
  CustomField,
  EntityTable,
  FieldOptionId,
  FieldOption,
  MultiSelectField,
  SelectField,
  StatusField,
  StatusOption
} from '@dataview/core/types'
import { entityTable, string } from '@shared/core'

const EMPTY_OPTION_IDS: string[] = []
const EMPTY_OPTIONS: FieldOption[] = []

export type OptionField = Extract<CustomField, {
  kind: 'select' | 'multiSelect' | 'status'
}>

type OptionEntityTable<TOption extends FieldOption = FieldOption> = EntityTable<FieldOptionId, TOption>

const readOptionTable = (
  field?: CustomField
): OptionEntityTable | undefined => isOptionField(field)
  ? field.options
  : undefined

export const isOptionField = (
  field?: CustomField
): field is OptionField => (
  field?.kind === 'select'
  || field?.kind === 'multiSelect'
  || field?.kind === 'status'
)

export const readFieldOptions = (
  field?: CustomField
): FieldOption[] => {
  const table = readOptionTable(field)
  return table
    ? table.ids.flatMap((optionId) => {
      const option = table.byId[optionId]
      return option
        ? [structuredClone(option)]
        : []
    })
    : EMPTY_OPTIONS
}

export const readFieldOptionIds = (
  field?: CustomField
): readonly FieldOptionId[] => readOptionTable(field)?.ids ?? EMPTY_OPTION_IDS

export const readFieldOptionEntity = (
  field: CustomField | undefined,
  optionId: unknown
): FieldOption | undefined => {
  const normalizedId = string.trimToUndefined(optionId)
  if (!normalizedId) {
    return undefined
  }

  return readOptionTable(field)?.byId[normalizedId]
}

export const readFieldOptionIndex = (
  field: CustomField | undefined,
  optionId: unknown
): number | undefined => {
  const normalizedId = string.trimToUndefined(optionId)
  if (!normalizedId) {
    return undefined
  }

  const ids = readOptionTable(field)?.ids
  if (!ids) {
    return undefined
  }

  const index = ids.indexOf(normalizedId)
  return index >= 0
    ? index
    : undefined
}

export const normalizeOptionToken = (
  value: unknown
): string | undefined => string.trimLowercase(value)

export const normalizeOptionIdList = (
  optionIds: readonly unknown[]
): string[] => {
  const seen = new Set<string>()
  const next: string[] = []

  optionIds.forEach(optionId => {
    const normalized = string.trimToUndefined(optionId)
    if (!normalized || seen.has(normalized)) {
      return
    }

    seen.add(normalized)
    next.push(normalized)
  })

  return next
}

export const normalizeOptionIds = (
  value: unknown
): string[] => (
  Array.isArray(value)
    ? normalizeOptionIdList(value)
    : EMPTY_OPTION_IDS
)

export const readFieldOption = (
  field: CustomField | undefined,
  optionId: unknown
): FieldOption | undefined => readFieldOptionEntity(field, optionId)

export const findFieldOptionByName = (
  field: CustomField | undefined,
  name: string
): FieldOption | undefined => {
  const normalizedName = normalizeOptionToken(name)
  if (!normalizedName) {
    return undefined
  }

  const table = readOptionTable(field)
  if (!table) {
    return undefined
  }

  for (let index = 0; index < table.ids.length; index += 1) {
    const option = table.byId[table.ids[index]!]
    if (option && normalizeOptionToken(option.name) === normalizedName) {
      return option
    }
  }

  return undefined
}

export const findFieldOption = (
  field: CustomField | undefined,
  value: unknown
): FieldOption | undefined => {
  const normalizedValue = normalizeOptionToken(value)
  if (!normalizedValue) {
    return undefined
  }

  const table = readOptionTable(field)
  if (!table) {
    return undefined
  }

  for (let index = 0; index < table.ids.length; index += 1) {
    const option = table.byId[table.ids[index]!]
    if (
      option
      && (
        normalizeOptionToken(option.id) === normalizedValue
        || normalizeOptionToken(option.name) === normalizedValue
      )
    ) {
      return option
    }
  }

  return undefined
}

export const readFieldOptionTokens = (
  field: CustomField | undefined,
  optionId: unknown
) => {
  const option = readFieldOption(field, optionId)
  if (!option) {
    const fallback = string.trimToUndefined(optionId)
    return fallback
      ? [fallback]
      : EMPTY_OPTION_IDS
  }

  return option.name === option.id
    ? [option.id]
    : [option.name, option.id]
}

export const readFieldOptionOrder = (
  field: CustomField | undefined,
  optionId: unknown
) => readFieldOptionIndex(field, optionId)

export const readFieldOptionId = (
  field: CustomField | undefined,
  value: unknown
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const option = readFieldOptions(field).find(entry => entry.id === value || entry.name === value)
  return option?.id ?? string.trimToUndefined(value)
}

export const createFieldOptionId = (
  options: readonly FieldOption[],
  name: string
) => {
  const baseToken = string.createKey(name) || 'option'
  const usedTokens = new Set(options.map(option => option.id))

  let nextToken = baseToken
  let suffix = 2
  while (usedTokens.has(nextToken)) {
    nextToken = `${baseToken}_${suffix}`
    suffix += 1
  }

  return nextToken
}

export const replaceFieldOptions = (
  field: OptionField,
  options: readonly FieldOption[]
): Pick<SelectField, 'options'> | Pick<MultiSelectField, 'options'> | Pick<StatusField, 'options'> => {
  const toTable = <TOption extends FieldOption>(
    list: readonly TOption[]
  ): OptionEntityTable<TOption> => entityTable.normalize.list(
    list.map((option) => structuredClone(option))
  )

  switch (field.kind) {
    case 'select':
      return {
        options: toTable(options.map(option => ({
          id: option.id,
          name: option.name,
          color: option.color ?? null,
          category: undefined
        })))
      }
    case 'multiSelect':
      return {
        options: toTable(options.map(option => ({
          id: option.id,
          name: option.name,
          color: option.color ?? null,
          category: undefined
        })))
      }
    case 'status':
      return {
        options: toTable(options.flatMap(option => (
          option.category !== undefined
            ? [{
                id: option.id,
                name: option.name,
                color: option.color ?? null,
                category: option.category
              } satisfies StatusOption]
            : []
        )))
      }
  }
}
