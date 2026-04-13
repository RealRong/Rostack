import {
  isNonEmptyString,
  trimLowercase
} from '@shared/core'
import type {
  DataDoc,
  FlatOption,
  CustomField,
  FieldOption,
  StatusOption
} from '@dataview/core/contracts/state'
import {
  DATE_DISPLAY_FORMATS,
  DATE_TIME_FORMATS,
  DATE_VALUE_KINDS,
  isCustomFieldKind,
  isValidDateTimeZone
} from '@dataview/core/field'
import { createIssue, type IssueSource, type ValidationIssue } from '../issues'

const validateBaseOptions = (
  source: IssueSource,
  options: readonly FieldOption[],
  path: string
) => {
  const issues: ValidationIssue[] = []
  const ids = new Set<string>()
  const names = new Set<string>()

  options.forEach((option, index) => {
    if (!isNonEmptyString(option.id)) {
      issues.push(createIssue(source, 'error', 'field.invalid', 'Field option id must be a non-empty string', `${path}.${index}.id`))
    } else if (ids.has(option.id)) {
      issues.push(createIssue(source, 'error', 'field.invalid', `Duplicate field option id: ${option.id}`, `${path}.${index}.id`))
    } else {
      ids.add(option.id)
    }

    if (!isNonEmptyString(option.name)) {
      issues.push(createIssue(source, 'error', 'field.invalid', 'Field option name must be a non-empty string', `${path}.${index}.name`))
    } else {
      const normalizedName = trimLowercase(option.name)
      if (!normalizedName) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Field option name must be a non-empty string', `${path}.${index}.name`))
        return
      }
      if (names.has(normalizedName)) {
        issues.push(createIssue(source, 'error', 'field.invalid', `Duplicate field option name: ${option.name}`, `${path}.${index}.name`))
      } else {
        names.add(normalizedName)
      }
    }

    if (option.color !== null && !isNonEmptyString(option.color)) {
      issues.push(createIssue(source, 'error', 'field.invalid', 'Field option color must be null or a non-empty string', `${path}.${index}.color`))
    }
  })

  return issues
}

const validateStatusOptions = (
  source: IssueSource,
  options: readonly StatusOption[],
  path: string
) => {
  const issues = validateBaseOptions(source, options, path)
  options.forEach((option, index) => {
    if (!['todo', 'in_progress', 'complete'].includes(option.category)) {
      issues.push(createIssue(source, 'error', 'field.invalid', `Status option category is invalid: ${String(option.category)}`, `${path}.${index}.category`))
    }
  })
  return issues
}

const validateFlatOptions = (
  source: IssueSource,
  options: readonly FlatOption[],
  path: string
) => validateBaseOptions(source, options, path)

const validateFieldShape = (
  source: IssueSource,
  field: CustomField,
  path: string
) => {
  const issues: ValidationIssue[] = []

  switch (field.kind) {
    case 'text':
    case 'email':
    case 'phone':
    case 'boolean':
      return issues
    case 'url':
      if (typeof field.displayFullUrl !== 'boolean') {
        issues.push(createIssue(source, 'error', 'field.invalid', 'URL field displayFullUrl must be boolean', `${path}.displayFullUrl`))
      }
      return issues
    case 'number':
      if (!['number', 'integer', 'percent', 'currency'].includes(field.format)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Number field format is invalid', `${path}.format`))
      }
      if (field.precision !== null && (!Number.isInteger(field.precision) || field.precision < 0)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Number field precision must be null or a non-negative integer', `${path}.precision`))
      }
      if (field.currency !== null && !isNonEmptyString(field.currency)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Number field currency must be null or a non-empty string', `${path}.currency`))
      }
      if (typeof field.useThousandsSeparator !== 'boolean') {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Number field useThousandsSeparator must be boolean', `${path}.useThousandsSeparator`))
      }
      return issues
    case 'select':
    case 'multiSelect':
      if (!Array.isArray(field.options)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Field options must be an array', `${path}.options`))
        return issues
      }
      issues.push(...validateFlatOptions(source, field.options, `${path}.options`))
      return issues
    case 'status':
      if (!Array.isArray(field.options)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Field options must be an array', `${path}.options`))
        return issues
      }
      issues.push(...validateStatusOptions(source, field.options, `${path}.options`))
      if (field.defaultOptionId !== null && field.defaultOptionId !== undefined && typeof field.defaultOptionId !== 'string') {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Status field defaultOptionId must be null or a non-empty string', `${path}.defaultOptionId`))
      } else if (
        typeof field.defaultOptionId === 'string'
        && (
          !isNonEmptyString(field.defaultOptionId)
          || !field.options.some(option => option.id === field.defaultOptionId)
        )
      ) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Status field defaultOptionId must reference an existing option', `${path}.defaultOptionId`))
      }
      return issues
    case 'date':
      if (!DATE_DISPLAY_FORMATS.includes(field.displayDateFormat)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Date field displayDateFormat is invalid', `${path}.displayDateFormat`))
      }
      if (!DATE_TIME_FORMATS.includes(field.displayTimeFormat)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Date field displayTimeFormat is invalid', `${path}.displayTimeFormat`))
      }
      if (!DATE_VALUE_KINDS.includes(field.defaultValueKind)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Date field defaultValueKind is invalid', `${path}.defaultValueKind`))
      }
      if (field.defaultTimezone !== null && (typeof field.defaultTimezone !== 'string' || !isValidDateTimeZone(field.defaultTimezone))) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Date field defaultTimezone must be null or a valid IANA timezone', `${path}.defaultTimezone`))
      }
      return issues
    case 'asset':
      if (typeof field.multiple !== 'boolean') {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Asset field multiple must be boolean', `${path}.multiple`))
      }
      if (!['any', 'image', 'video', 'audio', 'media'].includes(field.accept)) {
        issues.push(createIssue(source, 'error', 'field.invalid', 'Asset field accept is invalid', `${path}.accept`))
      }
      return issues
  }
}

export const validateField = (
  _document: DataDoc,
  source: IssueSource,
  field: CustomField,
  path: string
) => {
  const issues: ValidationIssue[] = []

  if (!isNonEmptyString(field.id)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field id must be a non-empty string', `${path}.id`))
  }
  if (!isNonEmptyString(field.name)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field name must be a non-empty string', `${path}.name`))
  }
  if (!isCustomFieldKind(field.kind)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field kind is invalid', `${path}.kind`))
    return issues
  }

  issues.push(...validateFieldShape(source, field, path))
  return issues
}
