import type { GroupDocument, GroupProperty, GroupPropertyOption } from '@/core/contracts/state'
import {
  getDocumentPropertyById
} from '@/core/document'
import type { IndexedCommand } from '../context'
import { createIssue, type GroupValidationIssue } from '../issues'
import {
  DATE_DISPLAY_FORMATS,
  DATE_TIME_FORMATS,
  DATE_VALUE_KINDS,
  isGroupPropertyKind,
  isValidDateTimeZone,
  TITLE_PROPERTY_ID
} from '@/core/property'
import {
  isNonEmptyString
} from '../commands/shared'

const isSameJsonValue = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

const validateOptions = (
  command: IndexedCommand,
  options: GroupPropertyOption[],
  path: string
) => {
  const issues: GroupValidationIssue[] = []
  const ids = new Set<string>()
  const keys = new Set<string>()
  const names = new Set<string>()

  options.forEach((option, index) => {
    if (!isNonEmptyString(option.id)) {
      issues.push(createIssue(command, 'error', 'field.invalid', 'Field option id must be a non-empty string', `${path}.${index}.id`))
    } else if (ids.has(option.id)) {
      issues.push(createIssue(command, 'error', 'field.invalid', `Duplicate field option id: ${option.id}`, `${path}.${index}.id`))
    } else {
      ids.add(option.id)
    }

    if (!isNonEmptyString(option.key)) {
      issues.push(createIssue(command, 'error', 'field.invalid', 'Field option key must be a non-empty string', `${path}.${index}.key`))
    } else if (keys.has(option.key)) {
      issues.push(createIssue(command, 'error', 'field.invalid', `Duplicate field option key: ${option.key}`, `${path}.${index}.key`))
    } else {
      keys.add(option.key)
    }

    if (!isNonEmptyString(option.name)) {
      issues.push(createIssue(command, 'error', 'field.invalid', 'Field option name must be a non-empty string', `${path}.${index}.name`))
    } else if (names.has(option.name)) {
      issues.push(createIssue(command, 'error', 'field.invalid', `Duplicate field option name: ${option.name}`, `${path}.${index}.name`))
    } else {
      names.add(option.name)
    }
  })

  return issues
}

const validatePropertyConfig = (
  command: IndexedCommand,
  property: GroupProperty,
  path: string
) => {
  const issues: GroupValidationIssue[] = []
  const { config } = property

  if (!config) {
    return issues
  }

  if (config.type !== property.kind) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Field config.type must match field.kind', `${path}.config.type`))
    return issues
  }

  switch (config.type) {
    case 'text':
    case 'email':
    case 'phone':
      return issues
    case 'url':
      if (
        config.displayFullUrl !== undefined
        && typeof config.displayFullUrl !== 'boolean'
      ) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'URL field displayFullUrl must be boolean', `${path}.config.displayFullUrl`))
      }
      return issues
    case 'number':
      if (config.format && !['number', 'integer', 'percent', 'currency'].includes(config.format)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Number field format is invalid', `${path}.config.format`))
      }
      if (config.precision !== undefined && (!Number.isInteger(config.precision) || config.precision < 0)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Number field precision must be a non-negative integer', `${path}.config.precision`))
      }
      if (config.currency !== undefined && !isNonEmptyString(config.currency)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Number field currency must be a non-empty string', `${path}.config.currency`))
      }
      if (config.useThousandsSeparator !== undefined && typeof config.useThousandsSeparator !== 'boolean') {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Number field useThousandsSeparator must be boolean', `${path}.config.useThousandsSeparator`))
      }
      return issues
    case 'select':
    case 'multiSelect':
      if (!Array.isArray(config.options)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Field options must be an array', `${path}.config.options`))
        return issues
      }
      issues.push(...validateOptions(command, config.options, `${path}.config.options`))
      return issues
    case 'status':
      if (!Array.isArray(config.options)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Field options must be an array', `${path}.config.options`))
        return issues
      }
      issues.push(...validateOptions(command, config.options, `${path}.config.options`))
      config.options.forEach((option, index) => {
        if (
          option.category !== undefined
          && !['todo', 'in_progress', 'complete'].includes(option.category)
        ) {
          issues.push(createIssue(
            command,
            'error',
            'field.invalid',
            `Status option category is invalid: ${option.category}`,
            `${path}.config.options.${index}.category`
          ))
        }
      })
      return issues
    case 'date':
      if (
        config.displayDateFormat !== undefined
        && !DATE_DISPLAY_FORMATS.includes(config.displayDateFormat)
      ) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Date field displayDateFormat is invalid', `${path}.config.displayDateFormat`))
      }
      if (
        config.displayTimeFormat !== undefined
        && !DATE_TIME_FORMATS.includes(config.displayTimeFormat)
      ) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Date field displayTimeFormat is invalid', `${path}.config.displayTimeFormat`))
      }
      if (
        config.defaultValueKind !== undefined
        && !DATE_VALUE_KINDS.includes(config.defaultValueKind)
      ) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Date field defaultValueKind is invalid', `${path}.config.defaultValueKind`))
      }
      if (
        config.defaultTimezone !== undefined
        && config.defaultTimezone !== null
        && (typeof config.defaultTimezone !== 'string' || !isValidDateTimeZone(config.defaultTimezone))
      ) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Date field defaultTimezone must be null or a valid IANA timezone', `${path}.config.defaultTimezone`))
      }
      return issues
    case 'checkbox':
      if (config.label !== undefined && typeof config.label !== 'string') {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Checkbox field label must be a string', `${path}.config.label`))
      }
      return issues
    case 'file':
      if (config.multiple !== undefined && typeof config.multiple !== 'boolean') {
        issues.push(createIssue(command, 'error', 'field.invalid', 'File field multiple must be boolean', `${path}.config.multiple`))
      }
      if (config.accept !== undefined && (!Array.isArray(config.accept) || config.accept.some(type => !isNonEmptyString(type)))) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'File field accept must be a string array', `${path}.config.accept`))
      }
      return issues
    case 'media':
      if (config.multiple !== undefined && typeof config.multiple !== 'boolean') {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Media field multiple must be boolean', `${path}.config.multiple`))
      }
      if (config.accept !== undefined && (
        !Array.isArray(config.accept)
        || config.accept.some(type => !['image', 'video', 'audio'].includes(type))
      )) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Media field accept must be image/video/audio array', `${path}.config.accept`))
      }
      return issues
  }
}

export const validateProperty = (
  document: GroupDocument,
  command: IndexedCommand,
  property: GroupProperty,
  path: string
) => {
  const issues: GroupValidationIssue[] = []

  if (!isNonEmptyString(property.id)) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Field id must be a non-empty string', `${path}.id`))
  }
  if (!isNonEmptyString(property.name)) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Field name must be a non-empty string', `${path}.name`))
  }
  if (!isGroupPropertyKind(property.kind)) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Field kind is invalid', `${path}.kind`))
  }

  if (property.id === TITLE_PROPERTY_ID) {
    if (property.kind !== 'text') {
      issues.push(createIssue(command, 'error', 'field.invalid', 'Title property kind must always be text', `${path}.kind`))
    }
    if (property.config !== undefined && property.config.type !== 'text') {
      issues.push(createIssue(command, 'error', 'field.invalid', 'Title property config must always be text', `${path}.config.type`))
    }

    const currentTitleProperty = getDocumentPropertyById(document, TITLE_PROPERTY_ID)
    if (currentTitleProperty) {
      if (property.kind !== currentTitleProperty.kind) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Title property kind cannot be changed', `${path}.kind`))
      }
      if (!isSameJsonValue(property.config, currentTitleProperty.config)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Title property config cannot be changed', `${path}.config`))
      }
      if (!isSameJsonValue(property.meta, currentTitleProperty.meta)) {
        issues.push(createIssue(command, 'error', 'field.invalid', 'Title property meta cannot be changed', `${path}.meta`))
      }
    }
  }

  if (isGroupPropertyKind(property.kind)) {
    issues.push(...validatePropertyConfig(command, property, path))
  }

  return issues
}

export const validateTitlePropertyPatch = (
  command: IndexedCommand,
  propertyId: string,
  patch: Partial<Omit<GroupProperty, 'id'>>,
  path: string
) => {
  if (propertyId !== TITLE_PROPERTY_ID) {
    return [] as GroupValidationIssue[]
  }

  const issues: GroupValidationIssue[] = []
  Object.keys(patch).forEach(key => {
    if (key !== 'name') {
      issues.push(createIssue(
        command,
        'error',
        'field.invalid',
        'Title property only supports name updates',
        `${path}.${key}`
      ))
    }
  })

  return issues
}
