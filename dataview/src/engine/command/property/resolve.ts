import type { GroupBaseOperation } from '@/core/contracts/operations'
import type { GroupDocument, GroupProperty, GroupPropertyOption } from '@/core/contracts/state'
import {
  getDocumentPropertyById,
  getDocumentProperties,
  getDocumentRecords,
  getDocumentViews
} from '@/core/document'
import {
  createUniquePropertyName,
  createUniquePropertyOptionToken,
  defaultPropertyConfig,
  findPropertyOptionByName,
  getPropertyOptions,
  hasPropertyOptions,
  replacePropertyOptions,
  TITLE_PROPERTY_ID,
  convertPropertyKindConfig
} from '@/core/property'
import {
  cloneGroupViewOptions
} from '@/core/view'
import type { IndexedCommand } from '../context'
import { createPropertyId } from '../entityId'
import { createIssue, hasValidationErrors, type GroupValidationIssue } from '../issues'
import {
  deriveCommand,
  hasProperty,
  resolveCommandResult,
  validatePropertyExists
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
  property: GroupProperty,
  input: {
    kind: GroupProperty['kind']
    config?: GroupProperty['config']
  }
): Partial<Omit<GroupProperty, 'id'>> => ({
  kind: input.kind,
  config: input.config ?? convertPropertyKindConfig(property, input.kind)
})

const resolveOptionPropertyContext = (
  document: GroupDocument,
  command: IndexedCommand,
  propertyId: string
) => {
  const issues = validatePropertyExists(document, command, propertyId)
  if (hasValidationErrors(issues)) {
    return {
      issues
    }
  }

  const property = getDocumentPropertyById(document, propertyId)
  if (!property) {
    return {
      issues
    }
  }

  if (!hasPropertyOptions(property)) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Property does not support options', 'propertyId'))
    return {
      issues
    }
  }

  return {
    issues,
    property,
    options: getPropertyOptions(property)
  }
}

const createOptionName = (options: readonly GroupPropertyOption[]) => {
  let index = 1
  let nextName = DEFAULT_OPTION_NAME

  while (findPropertyOptionByName(options, nextName)) {
    index += 1
    nextName = `${DEFAULT_OPTION_NAME} ${index}`
  }

  return nextName
}

const createNextPropertyOption = (
  property: GroupProperty & { kind: 'select' | 'multiSelect' | 'status' },
  options: readonly GroupPropertyOption[],
  name: string
): GroupPropertyOption => {
  const token = createUniquePropertyOptionToken(options, name)
  return {
    id: token,
    key: token,
    name,
    ...(property.kind === 'status'
      ? { category: 'todo' as const }
      : {})
  }
}

export const resolvePropertyCreateCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.create' }>
) => {
  const explicitPropertyId = command.input.id?.trim()
  const idIssues: GroupValidationIssue[] = []
  if (command.input.id !== undefined && !explicitPropertyId) {
    idIssues.push(createIssue(command, 'error', 'field.invalid', 'Field id must be a non-empty string', 'input.id'))
  }
  if (explicitPropertyId && hasProperty(document, explicitPropertyId)) {
    idIssues.push(createIssue(command, 'error', 'field.invalid', `Field already exists: ${explicitPropertyId}`, 'input.id'))
  }

  if (hasValidationErrors(idIssues)) {
    return resolveCommandResult(idIssues)
  }

  const propertyId = explicitPropertyId || createPropertyId()
  const kind = command.input.kind ?? 'text'
  const property: GroupProperty = {
    id: propertyId,
    name: command.input.name,
    kind,
    config: command.input.config ?? defaultPropertyConfig(kind),
    meta: command.input.meta
  }

  const putResult = resolvePropertyPutCommand(document, deriveCommand(command, 'property.put', {
    property
  }))
  const viewOperations = resolvePropertyCreateViewOperations(document, property)

  return resolveCommandResult(
    putResult.issues,
    [...putResult.operations, ...viewOperations]
  )
}

export const resolvePropertyPutCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.put' }>
) => {
  return resolveCommandResult(
    validateProperty(document, command, command.property, 'property'),
    [{ type: 'document.property.put', property: command.property }]
  )
}

export const resolvePropertyConvertCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.convert' }>
) => {
  const issues = validatePropertyExists(document, command, command.propertyId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  if (command.propertyId === TITLE_PROPERTY_ID) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Title property cannot be converted', 'propertyId'))
    return resolveCommandResult(issues)
  }

  const property = getDocumentPropertyById(document, command.propertyId)
  if (!property) {
    return resolveCommandResult(issues)
  }

  const patchResult = resolvePropertyPatchCommand(document, deriveCommand(command, 'property.patch', {
    propertyId: command.propertyId,
    patch: createPropertyConvertPatch(property, command.input)
  }))
  const nextProperty = {
    ...property,
    ...createPropertyConvertPatch(property, command.input)
  } as GroupProperty

  return resolveCommandResult(
    [...issues, ...patchResult.issues],
    [...patchResult.operations, ...resolvePropertyConvertViewOperations(document, nextProperty)]
  )
}

export const resolvePropertyDuplicateCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.duplicate' }>
) => {
  const issues = validatePropertyExists(document, command, command.propertyId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const sourceProperty = getDocumentPropertyById(document, command.propertyId)
  if (!sourceProperty) {
    return resolveCommandResult(issues)
  }

  const properties = getDocumentProperties(document)
  const nextPropertyId = createPropertyId()
  const nextName = createUniquePropertyName(`${sourceProperty.name} Copy`, properties)
  const isTitleProperty = sourceProperty.id === TITLE_PROPERTY_ID
  const nextKind = isTitleProperty ? 'text' : sourceProperty.kind
  const nextConfig = isTitleProperty
    ? { type: 'text' as const }
    : structuredClone(sourceProperty.config)
  const nextProperty: GroupProperty = {
    ...structuredClone(sourceProperty),
    id: nextPropertyId,
    name: nextName,
    kind: nextKind,
    config: nextConfig
  }

  const createResult = resolvePropertyCreateCommand(document, deriveCommand(command, 'property.create', {
    input: {
      id: nextPropertyId,
      name: nextName,
      kind: nextKind,
      config: nextConfig
    }
  }))

  const recordOperations: GroupBaseOperation[] = getDocumentRecords(document)
    .flatMap(record => {
      if (!Object.prototype.hasOwnProperty.call(record.values, sourceProperty.id)) {
        return []
      }

      return [{
        type: 'document.value.set' as const,
        recordId: record.id,
        property: nextPropertyId,
        value: structuredClone(record.values[sourceProperty.id])
      }]
    })

  const viewOperations: GroupBaseOperation[] = getDocumentViews(document)
    .flatMap(view => {
      const sourcePropertyIds = view.options.display.propertyIds
      const currentPropertyIds = (
        view.type === 'table' && !sourcePropertyIds.includes(nextPropertyId)
          ? [...sourcePropertyIds, nextPropertyId]
          : sourcePropertyIds
      )
      const sourceIndex = sourcePropertyIds.indexOf(sourceProperty.id)
      const createdIndex = currentPropertyIds.indexOf(nextPropertyId)

      if (sourceIndex === -1) {
        if (createdIndex === -1) {
          return []
        }

        return [{
          type: 'document.view.put' as const,
          view: {
            ...view,
            options: {
              ...cloneGroupViewOptions(view.options),
              display: {
                propertyIds: currentPropertyIds.filter(id => id !== nextPropertyId)
              }
            }
          }
        }]
      }

      const withoutCreated = currentPropertyIds.filter(id => id !== nextPropertyId)
      const nextPropertyIds = [...withoutCreated]
      const insertIndex = Math.min(sourceIndex + 1, nextPropertyIds.length)
      nextPropertyIds.splice(insertIndex, 0, nextPropertyId)

      return [{
        type: 'document.view.put' as const,
        view: {
          ...view,
          options: {
            ...cloneGroupViewOptions(view.options),
            display: {
              propertyIds: nextPropertyIds
            }
          }
        }
      }]
    })

  return resolveCommandResult(
    [...issues, ...createResult.issues],
    [...createResult.operations, ...recordOperations, ...viewOperations]
  )
}

export const resolvePropertyPatchCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.patch' }>
) => {
  const issues = validatePropertyExists(document, command, command.propertyId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  const property = getDocumentPropertyById(document, command.propertyId)
  if (!property) {
    return resolveCommandResult(issues)
  }

  if (!Object.keys(command.patch).length) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'field.patch patch cannot be empty', 'patch'))
  } else {
    issues.push(...validateTitlePropertyPatch(command, command.propertyId, command.patch, 'patch'))
    issues.push(...validateProperty(document, command, { ...property, ...command.patch }, 'patch'))
  }

  return resolveCommandResult(issues, [
    {
      type: 'document.property.patch',
      propertyId: command.propertyId,
      patch: command.patch
    }
  ])
}

export const resolvePropertyOptionRemoveCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.option.remove' }>
) => {
  const context = resolveOptionPropertyContext(document, command, command.propertyId)
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

  const patchResult = resolvePropertyPatchCommand(document, deriveCommand(command, 'property.patch', {
    propertyId: context.property.id,
    patch: {
      config: replacePropertyOptions(
        context.property,
        context.options.filter(option => option.id !== optionId)
      )
    }
  }))
  if (hasValidationErrors(patchResult.issues)) {
    return resolveCommandResult([...context.issues, ...patchResult.issues])
  }

  const operations: GroupBaseOperation[] = [...patchResult.operations]

  if (context.property.kind === 'select' || context.property.kind === 'status') {
    getDocumentRecords(document).forEach(record => {
      if (record.values[context.property.id] !== optionId) {
        return
      }

      operations.push({
        type: 'document.value.clear',
        recordId: record.id,
        property: context.property.id
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
          property: context.property.id,
          value: nextValue
        }
      : {
          type: 'document.value.clear',
          recordId: record.id,
          property: context.property.id
        })
  })

  return resolveCommandResult([...context.issues, ...patchResult.issues], operations)
}

export const resolvePropertyOptionCreateCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.option.create' }>
) => {
  const context = resolveOptionPropertyContext(document, command, command.propertyId)
  if (!context.property || !context.options || hasValidationErrors(context.issues)) {
    return resolveCommandResult(context.issues)
  }

  const explicitName = command.input?.name?.trim()
  if (command.input?.name !== undefined && !explicitName) {
    context.issues.push(createIssue(command, 'error', 'field.invalid', 'Property option name must be a non-empty string', 'input.name'))
    return resolveCommandResult(context.issues)
  }

  if (explicitName && findPropertyOptionByName(context.options, explicitName)) {
    return resolveCommandResult(context.issues)
  }

  const nextOption = createNextPropertyOption(
    context.property,
    context.options,
    explicitName ?? createOptionName(context.options)
  )

  return resolvePropertyPatchCommand(document, deriveCommand(command, 'property.patch', {
    propertyId: context.property.id,
    patch: {
      config: replacePropertyOptions(context.property, [...context.options, nextOption])
    }
  }))
}

export const resolvePropertyOptionReorderCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.option.reorder' }>
) => {
  const context = resolveOptionPropertyContext(document, command, command.propertyId)
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
    .filter((option): option is GroupPropertyOption => Boolean(option))
  const rest = context.options.filter(option => !seen.has(option.id))
  const nextOptions = [...ordered, ...rest]

  if (
    nextOptions.length === context.options.length
    && nextOptions.every((option, index) => option.id === context.options[index]?.id)
  ) {
    return resolveCommandResult(context.issues)
  }

  return resolvePropertyPatchCommand(document, deriveCommand(command, 'property.patch', {
    propertyId: context.property.id,
    patch: {
      config: replacePropertyOptions(context.property, nextOptions)
    }
  }))
}

export const resolvePropertyOptionUpdateCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.option.update' }>
) => {
  const context = resolveOptionPropertyContext(document, command, command.propertyId)
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

    const conflicting = findPropertyOptionByName(context.options, nextName)
    if (conflicting && conflicting.id !== optionId) {
      context.issues.push(createIssue(command, 'error', 'field.invalid', `Duplicate property option name: ${nextName}`, 'patch.name'))
      return resolveCommandResult(context.issues)
    }
  }

  const nextOption: GroupPropertyOption = {
    ...target,
    ...(nextName ? { name: nextName } : {}),
    ...(command.patch.color !== undefined
      ? (command.patch.color.trim()
          ? { color: command.patch.color.trim() }
          : { color: undefined })
      : {}),
    ...(context.property.kind === 'status' && command.patch.category !== undefined
      ? { category: command.patch.category }
      : {})
  }

  const sameName = nextOption.name === target.name
  const sameColor = nextOption.color === target.color
  const sameCategory = nextOption.category === target.category
  if (sameName && sameColor && sameCategory) {
    return resolveCommandResult(context.issues)
  }

  return resolvePropertyPatchCommand(document, deriveCommand(command, 'property.patch', {
    propertyId: context.property.id,
    patch: {
      config: replacePropertyOptions(
        context.property,
        context.options.map(option => option.id === optionId ? nextOption : option)
      )
    }
  }))
}

export const resolvePropertyRemoveCommand = (
  document: GroupDocument,
  command: Extract<IndexedCommand, { type: 'property.remove' }>
) => {
  const issues = validatePropertyExists(document, command, command.propertyId)
  if (hasValidationErrors(issues)) {
    return resolveCommandResult(issues)
  }

  if (command.propertyId === TITLE_PROPERTY_ID) {
    issues.push(createIssue(command, 'error', 'field.invalid', 'Title property cannot be removed', 'propertyId'))
    return resolveCommandResult(issues)
  }

  const operations = resolvePropertyRemoveViewOperations(document, command.propertyId)
  operations.push({
    type: 'document.property.remove',
    propertyId: command.propertyId
  })

  return resolveCommandResult(issues, operations)
}
