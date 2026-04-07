import type {
  EntityTable,
  FlatOption,
  CustomField,
  CustomFieldKind,
  StatusOption,
  CustomFieldId
} from '../../contracts/state'
import {
  createDefaultDateFieldConfig,
  DATE_DISPLAY_FORMATS,
  DATE_TIME_FORMATS,
  DATE_VALUE_KINDS,
  isValidDateTimeZone
} from '../kind/date'
import {
  CUSTOM_FIELD_KINDS,
  createDefaultFieldOfKind
} from '../kind/spec'
import {
  createDefaultStatusOptions,
  STATUS_CATEGORIES
} from '../kind/status'

export const isCustomFieldKind = (value: unknown): value is CustomFieldKind => (
  typeof value === 'string' && CUSTOM_FIELD_KINDS.includes(value as CustomFieldKind)
)

export const createFieldKey = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '')

export const createUniqueFieldName = (
  baseName: string,
  fields: readonly Pick<CustomField, 'name'>[] | readonly string[]
) => {
  const normalizedBaseName = baseName.trim()
  if (!normalizedBaseName) {
    return ''
  }

  const nameSet = new Set(
    fields
      .map(field => (
        typeof field === 'string'
          ? field
          : field.name
      ).trim())
      .filter(Boolean)
  )

  if (!nameSet.has(normalizedBaseName)) {
    return normalizedBaseName
  }

  let suffix = 1
  while (nameSet.has(`${normalizedBaseName}${suffix}`)) {
    suffix += 1
  }

  return `${normalizedBaseName}${suffix}`
}

const normalizeOptionColor = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

const normalizeFlatOption = (
  option: FlatOption
): FlatOption | undefined => {
  const id = option.id?.trim()
  const name = option.name?.trim()
  if (!id || !name) {
    return undefined
  }

  return {
    id,
    name,
    color: normalizeOptionColor(option.color)
  }
}

const normalizeStatusOption = (
  option: StatusOption
): StatusOption | undefined => {
  const normalized = normalizeFlatOption(option)
  if (!normalized) {
    return undefined
  }

  return {
    ...normalized,
    category: STATUS_CATEGORIES.includes(option.category)
      ? option.category
      : 'todo'
  }
}

export const createDefaultCustomField = (input: {
  id: CustomFieldId
  name: string
  kind: CustomFieldKind
  meta?: Record<string, unknown>
}): CustomField => createDefaultFieldOfKind(input.kind, input)

export const normalizeCustomField = (field: CustomField): CustomField => {
  const base = {
    id: field.id,
    name: field.name,
    ...(field.meta !== undefined
      ? { meta: structuredClone(field.meta) }
      : {})
  }

  switch (field.kind) {
    case 'text':
    case 'email':
    case 'phone':
    case 'boolean':
      return {
        ...base,
        kind: field.kind
      }
    case 'url':
      return {
        ...base,
        kind: 'url',
        displayFullUrl: field.displayFullUrl === true
      }
    case 'number':
      return {
        ...base,
        kind: 'number',
        format: ['number', 'integer', 'percent', 'currency'].includes(field.format)
          ? field.format
          : 'number',
        precision: typeof field.precision === 'number' && Number.isInteger(field.precision) && field.precision >= 0
          ? field.precision
          : null,
        currency: typeof field.currency === 'string' && field.currency.trim()
          ? field.currency.trim()
          : null,
        useThousandsSeparator: field.useThousandsSeparator === true
      }
    case 'select':
      return {
        ...base,
        kind: 'select',
        options: field.options
          .map(normalizeFlatOption)
          .filter((option): option is FlatOption => Boolean(option))
      }
    case 'multiSelect':
      return {
        ...base,
        kind: 'multiSelect',
        options: field.options
          .map(normalizeFlatOption)
          .filter((option): option is FlatOption => Boolean(option))
      }
    case 'status': {
      const options = field.options
        .map(normalizeStatusOption)
        .filter((option): option is StatusOption => Boolean(option))

      return {
        ...base,
        kind: 'status',
        options: options.length
          ? options
          : createDefaultStatusOptions()
      }
    }
    case 'date': {
      const defaults = createDefaultDateFieldConfig()

      return {
        ...base,
        kind: 'date',
        displayDateFormat: DATE_DISPLAY_FORMATS.includes(field.displayDateFormat)
          ? field.displayDateFormat
          : defaults.displayDateFormat,
        displayTimeFormat: DATE_TIME_FORMATS.includes(field.displayTimeFormat)
          ? field.displayTimeFormat
          : defaults.displayTimeFormat,
        defaultValueKind: DATE_VALUE_KINDS.includes(field.defaultValueKind)
          ? field.defaultValueKind
          : defaults.defaultValueKind,
        defaultTimezone: typeof field.defaultTimezone === 'string'
          ? (isValidDateTimeZone(field.defaultTimezone)
              ? field.defaultTimezone.trim()
              : defaults.defaultTimezone)
          : field.defaultTimezone === null
            ? null
            : defaults.defaultTimezone
      }
    }
    case 'asset':
      return {
        ...base,
        kind: 'asset',
        multiple: field.multiple !== false,
        accept: ['any', 'image', 'video', 'audio', 'media'].includes(field.accept)
          ? field.accept
          : 'any'
      }
  }
}

export const normalizeCustomFields = (
  fields: EntityTable<CustomFieldId, CustomField>
): EntityTable<CustomFieldId, CustomField> => {
  const byId = {} as Record<CustomFieldId, CustomField>
  const order: CustomFieldId[] = []
  const seen = new Set<CustomFieldId>()

  const push = (field: CustomField | undefined) => {
    if (!field) {
      return
    }

    const nextField = normalizeCustomField(field)
    if (seen.has(nextField.id)) {
      return
    }

    seen.add(nextField.id)
    byId[nextField.id] = nextField
    order.push(nextField.id)
  }

  fields.order.forEach(fieldId => {
    push(fields.byId[fieldId])
  })

  Object.keys(fields.byId).forEach(fieldIdKey => {
    push(fields.byId[fieldIdKey as CustomFieldId])
  })

  return {
    byId,
    order
  }
}
