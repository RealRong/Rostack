import type { BaseOperation } from '@dataview/core/contracts/operations'
import type { DataDoc, CustomField, FieldOption } from '@dataview/core/contracts/state'
import {
  getDocumentCustomFieldById,
  getDocumentCustomFields,
  getDocumentRecords,
  getDocumentViews
} from '@dataview/core/document'
import {
  createDefaultCustomField,
  createUniqueFieldName,
  createUniqueFieldOptionToken,
  convertFieldKind,
  findFieldOptionByName,
  getFieldOptions,
  hasFieldOptions,
  replaceFieldOptions
} from '@dataview/core/field'
import {
  cloneViewOptions
} from '@dataview/core/view'
import type { IndexedCommand } from '../context'
import { createPropertyId } from '../entityId'
import { createIssue, hasValidationErrors, type ValidationIssue } from '../issues'
import {
  deriveCommand,
  hasCustomField,
  resolveCommandResult,
  validateCustomFieldExists
} from '../commands/shared'
import {
  resolvePropertyConvertViewOperations,
  resolvePropertyCreateViewOperations,
  resolvePropertyRemoveViewOperations
} from './effects'
import {
  validateProperty,
  validateTitlePropertyPatch
} from './validate'

const DEFAULT_OPTION_NAME = 'Option'

const createPropertyConvertPatch = (
  property: CustomField,
  input: {
    kind: CustomField['kind']
  }
): Partial<Omit<CustomField, 'id'>> => {
  const next = convertFieldKind(property, input.kind)
  const { id: _id, ...patch } = next
  return patch
}

const resolveOptionPropertyContext = (
  document: DataDoc,
  command: IndexedCommand,
  fieldId: string
) => {
  const issues = validateCustomFieldExists(document, command, fieldId)
  if (hasValidationErrors(issues)) {
    return {
      issues
    }
  }

  const property = getDocumentCustomFieldById(document, fieldId)
  if (!property) {
    return {
      issues
    }
  }

  if (!hasFieldOptions(property)) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Field does not support options', 'fieldId'))
    return {
      issues
    }
  }

  return {
    issues,
    property,
    options: getFieldOptions(property)
  }
}

const createOptionName = (options: readonly FieldOption[]) => {
  let index = 1
  let nextName = DEFAULT_OPTION_NAME

  while (findFieldOptionByName(options, nextName)) {
    index += 1
    nextName = `${DEFAULT_OPTION_NAME} ${index}`
  }

  return nextName
}

const createNextPropertyOption = (
  property: CustomField & { kind: 'select' | 'multiSelect' | 'status' },
  options: readonly FieldOption[],
  name: string
): FieldOption => {
  const token = createUniqueFieldOptionToken(options, name)
  return {
    id: token,
    name,
    color: null,
    ...(property.kind === 'status'
      ? { category: 'todo' as const }
      : {})
  }
}

export const resolvePropertyCreateCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.create' }>
) => {
  const explicitPropertyId = command.input.id?.trim()
  const idIssues: ValidationIssue[] = []
  if (command.input.id !== undefined && !explicitPropertyId) {
    idIssues.push(createIssue(command, 'error', 'field.invalid', 'Field id must be a non-empty string', 'input.id'))
  }
  if (explicitPropertyId && hasCustomField(document, explicitPropertyId)) {
    idIssues.push(createIssue(command, 'error', 'field.invalid', `Field already exists: ${explicitPropertyId}`, 'input.id'))
  }

  if (hasValidationErrors(idIssues)) {
    return resolveCommandResult(idIssues)
  }

  const fieldId = explicitPropertyId || createPropertyId()
  const kind = command.input.kind ?? 'text'
  const property = createDefaultCustomField({
    id: fieldId,
    name: command.input.name,
    kind,
    meta: command.input.meta
  })

  const putResult = resolvePropertyPutCommand(document, deriveCommand(command, 'customField.put', {
    field: property
  }))
  const viewOperations = resolvePropertyCreateViewOperations(document, property)

  return resolveCommandResult(
    putResult.issues,
    [...putResult.operations, ...viewOperations]
  )
}

export const resolvePropertyPutCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.put' }>
) => {
  return resolveCommandResult(
    validateProperty(document, command, command.field, 'field'),
    [{ type: 'document.customField.put', field: command.field }]
  )
}

export const resolvePropertyConvertCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.convert' }>
) => {
  const issues = validateCustomFieldExists(document, command, command.fieldId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const property = getDocumentCustomFieldById(document, command.fieldId)
  if (!property) {
    return resolveCommandResult(issues)
  }

  const patchResult = resolvePropertyPatchCommand(document, deriveCommand(command, 'customField.patch', {
    fieldId: command.fieldId,
    patch: createPropertyConvertPatch(property, command.input)
  }))
  const nextProperty = {
    ...property,
    ...createPropertyConvertPatch(property, command.input)
  } as CustomField

  return resolveCommandResult(
    [...issues, ...patchResult.issues],
    [...patchResult.operations, ...resolvePropertyConvertViewOperations(document, nextProperty)]
  )
}

export const resolvePropertyDuplicateCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.duplicate' }>
) => {
  const issues = validateCustomFieldExists(document, command, command.fieldId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const sourceProperty = getDocumentCustomFieldById(document, command.fieldId)
  if (!sourceProperty) {
    return resolveCommandResult(issues)
  }

  const properties = getDocumentCustomFields(document)
  const nextPropertyId = createPropertyId()
  const nextName = createUniqueFieldName(`${sourceProperty.name} Copy`, properties)
  const nextProperty: CustomField = {
    ...structuredClone(sourceProperty),
    id: nextPropertyId,
    name: nextName
  }

  const putResult = resolvePropertyPutCommand(document, deriveCommand(command, 'customField.put', {
    field: nextProperty
  }))
  const createViewOperations = resolvePropertyCreateViewOperations(document, nextProperty)

  const recordOperations: BaseOperation[] = getDocumentRecords(document)
    .flatMap(record => {
      if (!Object.prototype.hasOwnProperty.call(record.values, sourceProperty.id)) {
        return []
      }

      return [{
        type: 'document.value.set' as const,
        recordId: record.id,
        field: nextPropertyId,
        value: structuredClone(record.values[sourceProperty.id])
      }]
    })

  const viewOperations: BaseOperation[] = getDocumentViews(document)
    .flatMap(view => {
      const sourceFieldIds = view.options.display.fieldIds
      const currentFieldIds = (
        view.type === 'table' && !sourceFieldIds.includes(nextPropertyId)
          ? [...sourceFieldIds, nextPropertyId]
          : sourceFieldIds
      )
      const sourceIndex = sourceFieldIds.indexOf(sourceProperty.id)
      const createdIndex = currentFieldIds.indexOf(nextPropertyId)

      if (sourceIndex === -1) {
        if (createdIndex === -1) {
          return []
        }

        return [{
          type: 'document.view.put' as const,
          view: {
            ...view,
            options: {
              ...cloneViewOptions(view.options),
              display: {
                fieldIds: currentFieldIds.filter(id => id !== nextPropertyId)
              }
            }
          }
        }]
      }

      const withoutCreated = currentFieldIds.filter(id => id !== nextPropertyId)
      const nextFieldIds = [...withoutCreated]
      const insertIndex = Math.min(sourceIndex + 1, nextFieldIds.length)
      nextFieldIds.splice(insertIndex, 0, nextPropertyId)

      return [{
        type: 'document.view.put' as const,
        view: {
          ...view,
          options: {
              ...cloneViewOptions(view.options),
              display: {
                fieldIds: nextFieldIds
              }
            }
          }
      }]
    })

  return resolveCommandResult(
    [...issues, ...putResult.issues],
    [...putResult.operations, ...createViewOperations, ...recordOperations, ...viewOperations]
  )
}

export const resolvePropertyReplaceSchemaCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.replaceSchema' }>
) => {
  const issues = validateCustomFieldExists(document, command, command.fieldId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const schema = {
    ...structuredClone(command.schema),
    id: command.fieldId
  } satisfies CustomField

  return resolveCommandResult(
    [...issues, ...validateProperty(document, command, schema, 'schema')],
    [{
      type: 'document.customField.put',
      field: schema
    }]
  )
}

export const resolvePropertyPatchCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.patch' }>
) => {
  const issues = validateCustomFieldExists(document, command, command.fieldId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const property = getDocumentCustomFieldById(document, command.fieldId)
  if (!property) {
    return resolveCommandResult(issues)
  }

  if (!Object.keys(command.patch).length) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'field.patch patch cannot be empty', 'patch'))
  } else {
    issues.push(...validateTitlePropertyPatch())
    issues.push(...validateProperty(document, command, { ...(property as CustomField), ...(command.patch as Partial<CustomField>) } as CustomField, 'patch'))
  }

  return resolveCommandResult(issues, [
    {
      type: 'document.customField.patch',
      fieldId: command.fieldId,
      patch: command.patch
    }
  ])
}

export const resolvePropertyOptionRemoveCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.option.remove' }>
) => {
  const context = resolveOptionPropertyContext(document, command, command.fieldId)
  if (!context.property || !context.options || hasValidationErrors(context.issues)) {
    return resolveCommandResult(context.issues)
  }

  const optionId = command.optionId.trim()
  if (!optionId) {
    context.issues.push(createIssue(command, 'error', 'field.invalid', 'Property option id must be a non-empty string', 'optionId'))
    return resolveCommandResult(context.issues)
  }

  if (!context.options.some(option => option.id === optionId)) {
    context.issues.push(createIssue(command, 'error', 'field.invalid', `Unknown property option: ${optionId}`, 'optionId'))
    return resolveCommandResult(context.issues)
  }

  const patchResult = resolvePropertyPatchCommand(document, deriveCommand(command, 'customField.patch', {
    fieldId: context.property.id,
    patch: {
      ...replaceFieldOptions(
        context.property,
        context.options.filter(option => option.id !== optionId)
      ),
      ...(context.property.kind === 'status' && context.property.defaultOptionId === optionId
        ? {
            defaultOptionId: null
          }
        : {})
    } as Partial<Omit<CustomField, 'id'>>
  }))
  if (hasValidationErrors(patchResult.issues)) {
    return resolveCommandResult([...context.issues, ...patchResult.issues])
  }

  const operations: BaseOperation[] = [...patchResult.operations]

  if (context.property.kind === 'select' || context.property.kind === 'status') {
    getDocumentRecords(document).forEach(record => {
      if (record.values[context.property.id] !== optionId) {
        return
      }

      operations.push({
        type: 'document.value.clear',
        recordId: record.id,
        field: context.property.id
      })
    })

    return resolveCommandResult([...context.issues, ...patchResult.issues], operations)
  }

  getDocumentRecords(document).forEach(record => {
    const currentValue = record.values[context.property.id]
    if (!Array.isArray(currentValue)) {
      return
    }

    const nextValue = currentValue.filter(value => value !== optionId)
    if (nextValue.length === currentValue.length) {
      return
    }

    operations.push(nextValue.length
      ? {
          type: 'document.value.set',
          recordId: record.id,
          field: context.property.id,
          value: nextValue
        }
      : {
          type: 'document.value.clear',
          recordId: record.id,
          field: context.property.id
        })
  })

  return resolveCommandResult([...context.issues, ...patchResult.issues], operations)
}

export const resolvePropertyOptionCreateCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.option.create' }>
) => {
  const context = resolveOptionPropertyContext(document, command, command.fieldId)
  if (!context.property || !context.options || hasValidationErrors(context.issues)) {
    return resolveCommandResult(context.issues)
  }

  const explicitName = command.input?.name?.trim()
  if (command.input?.name !== undefined && !explicitName) {
    context.issues.push(createIssue(command, 'error', 'field.invalid', 'Property option name must be a non-empty string', 'input.name'))
    return resolveCommandResult(context.issues)
  }

  if (explicitName && findFieldOptionByName(context.options, explicitName)) {
    return resolveCommandResult(context.issues)
  }

  const nextOption = createNextPropertyOption(
    context.property,
    context.options,
    explicitName ?? createOptionName(context.options)
  )

  return resolvePropertyPatchCommand(document, deriveCommand(command, 'customField.patch', {
    fieldId: context.property.id,
    patch: replaceFieldOptions(context.property, [...context.options, nextOption]) as Partial<Omit<CustomField, 'id'>>
  }))
}

export const resolvePropertyOptionReorderCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.option.reorder' }>
) => {
  const context = resolveOptionPropertyContext(document, command, command.fieldId)
  if (!context.property || !context.options || hasValidationErrors(context.issues)) {
    return resolveCommandResult(context.issues)
  }

  const optionMap = new Map(context.options.map(option => [option.id, option] as const))
  const seen = new Set<string>()
  const ordered = command.optionIds
    .map(optionId => {
      if (seen.has(optionId)) {
        return undefined
      }

      seen.add(optionId)
      return optionMap.get(optionId)
    })
    .filter((option): option is FieldOption => Boolean(option))
  const rest = context.options.filter(option => !seen.has(option.id))
  const nextOptions = [...ordered, ...rest]

  if (
    nextOptions.length === context.options.length
    && nextOptions.every((option, index) => option.id === context.options[index]?.id)
  ) {
    return resolveCommandResult(context.issues)
  }

  return resolvePropertyPatchCommand(document, deriveCommand(command, 'customField.patch', {
    fieldId: context.property.id,
    patch: replaceFieldOptions(context.property, nextOptions) as Partial<Omit<CustomField, 'id'>>
  }))
}

export const resolvePropertyOptionUpdateCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.option.update' }>
) => {
  const context = resolveOptionPropertyContext(document, command, command.fieldId)
  if (!context.property || !context.options || hasValidationErrors(context.issues)) {
    return resolveCommandResult(context.issues)
  }

  const optionId = command.optionId.trim()
  if (!optionId) {
    context.issues.push(createIssue(command, 'error', 'field.invalid', 'Property option id must be a non-empty string', 'optionId'))
    return resolveCommandResult(context.issues)
  }

  const target = context.options.find(option => option.id === optionId)
  if (!target) {
    context.issues.push(createIssue(command, 'error', 'field.invalid', `Unknown property option: ${optionId}`, 'optionId'))
    return resolveCommandResult(context.issues)
  }

  const nextName = command.patch.name?.trim()
  if (command.patch.name !== undefined) {
    if (!nextName) {
      context.issues.push(createIssue(command, 'error', 'field.invalid', 'Property option name must be a non-empty string', 'patch.name'))
      return resolveCommandResult(context.issues)
    }

    const conflicting = findFieldOptionByName(context.options, nextName)
    if (conflicting && conflicting.id !== optionId) {
      context.issues.push(createIssue(command, 'error', 'field.invalid', `Duplicate property option name: ${nextName}`, 'patch.name'))
      return resolveCommandResult(context.issues)
    }
  }

  const nextOption: FieldOption = {
    ...target,
    ...(nextName ? { name: nextName } : {}),
    ...(command.patch.color !== undefined
      ? (command.patch.color.trim()
          ? { color: command.patch.color.trim() }
          : { color: null })
      : {}),
    ...(context.property.kind === 'status' && command.patch.category !== undefined
      ? { category: command.patch.category }
      : {})
  }

  const sameName = nextOption.name === target.name
  const sameColor = nextOption.color === target.color
  const sameCategory = (
    context.property.kind === 'status'
      ? ('category' in nextOption && 'category' in target && nextOption.category === target.category)
      : true
  )
  if (sameName && sameColor && sameCategory) {
    return resolveCommandResult(context.issues)
  }

  return resolvePropertyPatchCommand(document, deriveCommand(command, 'customField.patch', {
    fieldId: context.property.id,
    patch: replaceFieldOptions(
      context.property,
      context.options.map(option => option.id === optionId ? nextOption : option)
    ) as Partial<Omit<CustomField, 'id'>>
  }))
}

export const resolvePropertyRemoveCommand = (
  document: DataDoc,
  command: Extract<IndexedCommand, { type: 'customField.remove' }>
) => {
  const issues = validateCustomFieldExists(document, command, command.fieldId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const operations = resolvePropertyRemoveViewOperations(document, command.fieldId)
  operations.push({
    type: 'document.customField.remove',
    fieldId: command.fieldId
  })

  return resolveCommandResult(issues, operations)
}
