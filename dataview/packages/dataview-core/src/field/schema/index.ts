import type {
  EntityTable,
  FlatOption,
  CustomField,
  CustomFieldKind,
  StatusOption,
  CustomFieldId
} from '#dataview-core/contracts/state'
import {
  createDefaultDateFieldConfig,
  DATE_DISPLAY_FORMATS,
  DATE_TIME_FORMATS,
  DATE_VALUE_KINDS,
  isValidDateTimeZone
} from '#dataview-core/field/kind/date'
import {
  CUSTOM_FIELD_KINDS,
  createDefaultFieldOfKind
} from '#dataview-core/field/kind/spec'
import {
  createDefaultStatusOptions,
  STATUS_CATEGORIES
} from '#dataview-core/field/kind/status'
import {
  isNonEmptyString,
  trimLowercase
} from '@shared/core'

export interface FieldSchemaValidationIssue {
  path: string
  message: string
}

const createFieldSchemaIssue = (
  path: string,
  message: string
): FieldSchemaValidationIssue => ({
  path,
  message
})

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

const normalizeStatusDefaultOptionId = (
  options: readonly StatusOption[],
  value: unknown
) => {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized) {
    return null
  }

  return options.some(option => option.id === normalized)
    ? normalized
    : null
}

export const createDefaultCustomField = (input: {
  id: CustomFieldId
  name: string
  kind: CustomFieldKind
  meta?: Record<string, unknown>
}): CustomField => createDefaultFieldOfKind(input.kind, input)

const validateBaseOptions = (
  options: readonly FlatOption[],
  path: string
): FieldSchemaValidationIssue[] => {
  const issues: FieldSchemaValidationIssue[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  options.forEach((option, index) => {
    if (!isNonEmptyString(option.id)) {
      issues.push(createFieldSchemaIssue(
        `${path}.${index}.id`,
        'Field option id must be a non-empty string'
      ))
    } else if (ids.has(option.id)) {
      issues.push(createFieldSchemaIssue(
        `${path}.${index}.id`,
        `Duplicate field option id: ${option.id}`
      ))
    } else {
      ids.add(option.id)
    }

    if (!isNonEmptyString(option.name)) {
      issues.push(createFieldSchemaIssue(
        `${path}.${index}.name`,
        'Field option name must be a non-empty string'
      ))
    } else {
      const normalizedName = trimLowercase(option.name)
      if (!normalizedName) {
        issues.push(createFieldSchemaIssue(
          `${path}.${index}.name`,
          'Field option name must be a non-empty string'
        ))
      } else if (names.has(normalizedName)) {
        issues.push(createFieldSchemaIssue(
          `${path}.${index}.name`,
          `Duplicate field option name: ${option.name}`
        ))
      } else {
        names.add(normalizedName)
      }
    }

    if (option.color !== null && !isNonEmptyString(option.color)) {
      issues.push(createFieldSchemaIssue(
        `${path}.${index}.color`,
        'Field option color must be null or a non-empty string'
      ))
    }
  })

  return issues
}

export const validateCustomFieldShape = (
  field: CustomField,
  path: string
): readonly FieldSchemaValidationIssue[] => {
  const issues: FieldSchemaValidationIssue[] = []

  switch (field.kind) {
    case 'text':
    case 'email':
    case 'phone':
    case 'boolean':
      return issues
    case 'url':
      if (typeof field.displayFullUrl !== 'boolean') {
        issues.push(createFieldSchemaIssue(
          `${path}.displayFullUrl`,
          'URL field displayFullUrl must be boolean'
        ))
      }
      return issues
    case 'number':
      if (!['number', 'integer', 'percent', 'currency'].includes(field.format)) {
        issues.push(createFieldSchemaIssue(
          `${path}.format`,
          'Number field format is invalid'
        ))
      }
      if (field.precision !== null && (!Number.isInteger(field.precision) || field.precision < 0)) {
        issues.push(createFieldSchemaIssue(
          `${path}.precision`,
          'Number field precision must be null or a non-negative integer'
        ))
      }
      if (field.currency !== null && !isNonEmptyString(field.currency)) {
        issues.push(createFieldSchemaIssue(
          `${path}.currency`,
          'Number field currency must be null or a non-empty string'
        ))
      }
      if (typeof field.useThousandsSeparator !== 'boolean') {
        issues.push(createFieldSchemaIssue(
          `${path}.useThousandsSeparator`,
          'Number field useThousandsSeparator must be boolean'
        ))
      }
      return issues
    case 'select':
    case 'multiSelect':
      issues.push(...validateBaseOptions(field.options, `${path}.options`))
      return issues
    case 'status':
      issues.push(...validateBaseOptions(field.options, `${path}.options`))
      field.options.forEach((option, index) => {
        if (!STATUS_CATEGORIES.includes(option.category)) {
          issues.push(createFieldSchemaIssue(
            `${path}.options.${index}.category`,
            `Status option category is invalid: ${String(option.category)}`
          ))
        }
      })
      if (field.defaultOptionId !== null && field.defaultOptionId !== undefined && typeof field.defaultOptionId !== 'string') {
        issues.push(createFieldSchemaIssue(
          `${path}.defaultOptionId`,
          'Status field defaultOptionId must be null or a non-empty string'
        ))
      } else if (
        typeof field.defaultOptionId === 'string'
        && (
          !isNonEmptyString(field.defaultOptionId)
          || !field.options.some(option => option.id === field.defaultOptionId)
        )
      ) {
        issues.push(createFieldSchemaIssue(
          `${path}.defaultOptionId`,
          'Status field defaultOptionId must reference an existing option'
        ))
      }
      return issues
    case 'date':
      if (!DATE_DISPLAY_FORMATS.includes(field.displayDateFormat)) {
        issues.push(createFieldSchemaIssue(
          `${path}.displayDateFormat`,
          'Date field displayDateFormat is invalid'
        ))
      }
      if (!DATE_TIME_FORMATS.includes(field.displayTimeFormat)) {
        issues.push(createFieldSchemaIssue(
          `${path}.displayTimeFormat`,
          'Date field displayTimeFormat is invalid'
        ))
      }
      if (!DATE_VALUE_KINDS.includes(field.defaultValueKind)) {
        issues.push(createFieldSchemaIssue(
          `${path}.defaultValueKind`,
          'Date field defaultValueKind is invalid'
        ))
      }
      if (
        field.defaultTimezone !== null
        && (
          typeof field.defaultTimezone !== 'string'
          || !isValidDateTimeZone(field.defaultTimezone)
        )
      ) {
        issues.push(createFieldSchemaIssue(
          `${path}.defaultTimezone`,
          'Date field defaultTimezone must be null or a valid IANA timezone'
        ))
      }
      return issues
    case 'asset':
      if (typeof field.multiple !== 'boolean') {
        issues.push(createFieldSchemaIssue(
          `${path}.multiple`,
          'Asset field multiple must be boolean'
        ))
      }
      if (!['any', 'image', 'video', 'audio', 'media'].includes(field.accept)) {
        issues.push(createFieldSchemaIssue(
          `${path}.accept`,
          'Asset field accept is invalid'
        ))
      }
      return issues
  }
}

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
      const nextOptions = options.length
        ? options
        : createDefaultStatusOptions()

      return {
        ...base,
        kind: 'status',
        options: nextOptions,
        defaultOptionId: normalizeStatusDefaultOptionId(nextOptions, field.defaultOptionId)
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
