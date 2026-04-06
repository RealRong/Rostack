import type {
  DataDoc,
  FlatOption,
  CustomField,
  FieldOption,
  StatusOption
} from '@dataview/core/contracts/state'
import type { IndexedCommand } from '../context'
import { createIssue, type ValidationIssue } from '../issues'
import {
  DATE_DISPLAY_FORMATS,
  DATE_TIME_FORMATS,
  DATE_VALUE_KINDS,
  isCustomFieldKind,
  isValidDateTimeZone
} from '@dataview/core/field'
import {
  isNonEmptyString
} from '../commands/shared'

const validateBaseOptions = (
  command: IndexedCommand,
  options: readonly FieldOption[],
  path: string
) => {
  const issues: ValidationIssue[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  options.forEach((option, index) => {
    if (!isNonEmptyString(option.id)) {
      issues.push(createIssue(command, 'error', 'field.invalid', 'Field option id must be a non-empty string', `${path}.${index}.id`))
    } else if (ids.has(option.id)) {
      issues.push(createIssue(command, 'error', 'field.invalid', `Duplicate field option id: ${option.id}`, `${path}.${index}.id`))
    } else {
      ids.add(option.id)
    }

    if (!isNonEmptyString(option.name)) {
      issues.push(createIssue(command, 'error', 'field.invalid', 'Field option name must be a non-empty string', `${path}.${index}.name`))
    } else {
      const normalizedName = option.name.trim().toLowerCase()
      if (names.has(normalizedName)) {
        issues.push(createIssue(command, 'error', 'field.invalid', `Duplicate field option name: ${option.name}`, `${path}.${index}.name`))
      } else {
        names.add(normalizedName)
      }
    }

    if (option.color !== null && !isNonEmptyString(option.color)) {
      issues.push(createIssue(command, 'error', 'field.invalid', 'Field option color must be null or a non-empty string', `${path}.${index}.color`))
    }
  })

  return issues
}

const validateFlatOptions = (
  command: IndexedCommand,
  options: readonly FlatOption[],
  path: string
) => validateBaseOptions(command, options, path)

const validateStatusOptions = (
  command: IndexedCommand,
  options: readonly StatusOption[],
  path: string
) => {
  const issues = validateBaseOptions(command, options, path)

  options.forEach((option, index) => {
    if (!['todo', 'in_progress', 'complete'].includes(option.category)) {
      issues.push(createIssue(
        command,
        'error',
        'field.invalid',
        `Status option category is invalid: ${String(option.category)}`,
        `${path}.${index}.category`
      ))
    }
  })

  return issues
}

const validatePropertyShape = (
  command: IndexedCommand,
  property: CustomField,
  path: string
) => {
  const issues: ValidationIssue[] = []

  switch (property.kind) {
    case 'text':
    case 'email':
    case 'phone':
    case 'boolean':
      return issues
    case 'url':
      if (typeof property.displayFullUrl !== 'boolean') {
        issues.push(createIssue(command, 'error', 'field.invalid', 'URL field displayFullUrl must be boolean', `${path}.displayFullUrl`))
      }
      return issues
    case 'number':
      if (!['number', 'integer', 'percent', 'currency'].includes(property.format)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Number field format is invalid', `${path}.format`))
      }
      if (property.precision !== null && (!Number.isInteger(property.precision) || property.precision < 0)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Number field precision must be null or a non-negative integer', `${path}.precision`))
      }
      if (property.currency !== null && !isNonEmptyString(property.currency)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Number field currency must be null or a non-empty string', `${path}.currency`))
      }
      if (typeof property.useThousandsSeparator !== 'boolean') {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Number field useThousandsSeparator must be boolean', `${path}.useThousandsSeparator`))
      }
      return issues
    case 'select':
      if (!Array.isArray(property.options)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Field options must be an array', `${path}.options`))
        return issues
      }
      issues.push(...validateFlatOptions(command, property.options, `${path}.options`))
      return issues
    case 'multiSelect':
      if (!Array.isArray(property.options)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Field options must be an array', `${path}.options`))
        return issues
      }
      issues.push(...validateFlatOptions(command, property.options, `${path}.options`))
      return issues
    case 'status':
      if (!Array.isArray(property.options)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Field options must be an array', `${path}.options`))
        return issues
      }
      issues.push(...validateStatusOptions(command, property.options, `${path}.options`))
      return issues
    case 'date':
      if (!DATE_DISPLAY_FORMATS.includes(property.displayDateFormat)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Date field displayDateFormat is invalid', `${path}.displayDateFormat`))
      }
      if (!DATE_TIME_FORMATS.includes(property.displayTimeFormat)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Date field displayTimeFormat is invalid', `${path}.displayTimeFormat`))
      }
      if (!DATE_VALUE_KINDS.includes(property.defaultValueKind)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Date field defaultValueKind is invalid', `${path}.defaultValueKind`))
      }
      if (
        property.defaultTimezone !== null
        && (typeof property.defaultTimezone !== 'string' || !isValidDateTimeZone(property.defaultTimezone))
      ) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Date field defaultTimezone must be null or a valid IANA timezone', `${path}.defaultTimezone`))
      }
      return issues
    case 'asset':
      if (typeof property.multiple !== 'boolean') {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Asset field multiple must be boolean', `${path}.multiple`))
      }
      if (!['any', 'image', 'video', 'audio', 'media'].includes(property.accept)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Asset field accept is invalid', `${path}.accept`))
      }
      return issues
  }
}

export const validateProperty = (
  _document: DataDoc,
  command: IndexedCommand,
  property: CustomField,
  path: string
) => {
  const issues: ValidationIssue[] = []

  if (!isNonEmptyString(property.id)) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Field id must be a non-empty string', `${path}.id`))
  }
  if (!isNonEmptyString(property.name)) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Field name must be a non-empty string', `${path}.name`))
  }
  if (!isCustomFieldKind(property.kind)) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Field kind is invalid', `${path}.kind`))
    return issues
  }

  issues.push(...validatePropertyShape(command, property, path))
  return issues
}

export const validateTitlePropertyPatch = () => [] as ValidationIssue[]
