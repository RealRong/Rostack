import type {
  Action,
  CustomField,
  DataDoc
} from '@dataview/core/contracts'
import type { BaseOperation } from '@dataview/core/contracts/operations'
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
  repairViewForConvertedField,
  repairViewForRemovedField
} from '@dataview/core/view'
import {
  sameJsonValue,
  trimToUndefined
} from '@shared/core'
import { createFieldId } from '@dataview/engine/mutate/entityId'
import {
  createIssue,
  hasValidationErrors,
  type IssueSource,
  type ValidationIssue
} from '@dataview/engine/mutate/issues'
import { validateFieldExists } from '@dataview/engine/mutate/validate/entity'
import { validateField } from '@dataview/engine/mutate/validate/field'
import {
  planResult,
  sourceOf,
  toFieldPatch,
  toViewPut,
  type PlannedActionResult
} from '@dataview/engine/mutate/planner/shared'

const DEFAULT_OPTION_NAME = 'Option'

const buildCreateFieldViewOps = (
  document: DataDoc,
  field: CustomField
): BaseOperation[] => (
  getDocumentViews(document)
    .filter(view => view.type === 'table')
    .flatMap(view => (
      view.display.fields.includes(field.id)
        ? []
        : [toViewPut({
            ...view,
            display: {
              fields: [...view.display.fields, field.id]
            }
          })]
    ))
)

const buildRemovedFieldViewOps = (
  document: DataDoc,
  fieldId: string
): BaseOperation[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = repairViewForRemovedField(view, fieldId)
      return nextView === view
        ? []
        : [toViewPut(nextView)]
    })
)

const buildConvertedFieldViewOps = (
  document: DataDoc,
  field: CustomField
): BaseOperation[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = repairViewForConvertedField(view, field)
      return nextView === view
        ? []
        : [toViewPut(nextView)]
    })
)

const createFieldConvertPatch = (
  field: CustomField,
  input: {
    kind: CustomField['kind']
  }
): Partial<Omit<CustomField, 'id'>> => {
  const next = convertFieldKind(field, input.kind)
  const { id: _id, ...patch } = next
  return patch
}

const createOptionName = (
  options: Extract<CustomField, { kind: 'select' | 'multiSelect' | 'status' }>['options']
) => {
  let nextName = DEFAULT_OPTION_NAME
  let index = 1
  while (findFieldOptionByName(options, nextName)) {
    index += 1
    nextName = `${DEFAULT_OPTION_NAME} ${index}`
  }
  return nextName
}

const createNextFieldOption = (
  field: Extract<CustomField, { kind: 'select' | 'multiSelect' | 'status' }>,
  options: typeof field.options,
  name: string
) => {
  const token = createUniqueFieldOptionToken(options, name)
  return {
    id: token,
    name,
    color: null,
    ...(field.kind === 'status' ? { category: 'todo' as const } : {})
  }
}

const requireOptionField = (
  document: DataDoc,
  source: IssueSource,
  fieldId: string
) => {
  const issues = validateFieldExists(document, source, fieldId)
  const field = getDocumentCustomFieldById(document, fieldId)
  if (!field || hasValidationErrors(issues)) {
    return {
      issues
    }
  }
  if (!hasFieldOptions(field)) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field does not support options', 'fieldId'))
    return {
      issues
    }
  }
  return {
    issues,
    field,
    options: getFieldOptions(field)
  }
}

const lowerFieldCreate = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.create' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const explicitFieldId = trimToUndefined(action.input.id)
  const issues: ValidationIssue[] = []

  if (action.input.id !== undefined && !explicitFieldId) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field id must be a non-empty string', 'input.id'))
  }
  if (explicitFieldId && getDocumentCustomFieldById(document, explicitFieldId)) {
    issues.push(createIssue(source, 'error', 'field.invalid', `Field already exists: ${explicitFieldId}`, 'input.id'))
  }

  if (hasValidationErrors(issues)) {
    return planResult(issues)
  }

  const field = createDefaultCustomField({
    id: explicitFieldId || createFieldId(),
    name: action.input.name,
    kind: action.input.kind ?? 'text',
    meta: action.input.meta
  })

  const fieldIssues = validateField(document, source, field, 'input')
  return planResult(
    [...issues, ...fieldIssues],
    [
      {
        type: 'document.field.put',
        field
      },
      ...buildCreateFieldViewOps(document, field)
    ]
  )
}

const lowerFieldPatch = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.patch' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  const field = getDocumentCustomFieldById(document, action.fieldId)

  if (!field || hasValidationErrors(issues)) {
    return planResult(issues)
  }

  if (!Object.keys(action.patch).length) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'field.patch patch cannot be empty', 'patch'))
    return planResult(issues)
  }

  const nextField = {
    ...field,
    ...(action.patch as Partial<CustomField>)
  } as CustomField
  issues.push(...validateField(document, source, nextField, 'patch'))

  return planResult(issues, [toFieldPatch(action.fieldId, action.patch)])
}

const lowerFieldReplace = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.replace' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  const field = {
    ...structuredClone(action.field),
    id: action.fieldId
  } satisfies CustomField

  issues.push(...validateField(document, source, field, 'field'))
  return planResult(issues, [{
    type: 'document.field.put',
    field
  }])
}

const lowerFieldConvert = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.convert' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  const field = getDocumentCustomFieldById(document, action.fieldId)
  if (!field || hasValidationErrors(issues)) {
    return planResult(issues)
  }

  const patch = createFieldConvertPatch(field, action.input)
  const nextField = {
    ...field,
    ...patch
  } as CustomField
  issues.push(...validateField(document, source, nextField, 'input'))

  return planResult(
    issues,
    [
      toFieldPatch(action.fieldId, patch),
      ...buildConvertedFieldViewOps(document, nextField)
    ]
  )
}

const lowerFieldDuplicate = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.duplicate' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  const sourceField = getDocumentCustomFieldById(document, action.fieldId)
  if (!sourceField || hasValidationErrors(issues)) {
    return planResult(issues)
  }

  const nextFieldId = createFieldId()
  const nextField: CustomField = {
    ...structuredClone(sourceField),
    id: nextFieldId,
    name: createUniqueFieldName(`${sourceField.name} Copy`, getDocumentCustomFields(document))
  }
  issues.push(...validateField(document, source, nextField, 'field'))

  const recordOps: BaseOperation[] = getDocumentRecords(document).flatMap(record => (
    Object.prototype.hasOwnProperty.call(record.values, sourceField.id)
      ? [{
          type: 'document.value.set' as const,
          recordId: record.id,
          field: nextFieldId,
          value: structuredClone(record.values[sourceField.id])
        }]
      : []
  ))

  const viewOps: BaseOperation[] = getDocumentViews(document).flatMap(view => {
    const sourceFieldIds = view.display.fields
    const currentFieldIds = view.type === 'table' && !sourceFieldIds.includes(nextFieldId)
      ? [...sourceFieldIds, nextFieldId]
      : sourceFieldIds
    const sourceIndex = sourceFieldIds.indexOf(sourceField.id)
    const createdIndex = currentFieldIds.indexOf(nextFieldId)

    if (sourceIndex === -1) {
      if (createdIndex === -1) {
        return []
      }
      return [toViewPut({
        ...view,
        display: {
          fields: currentFieldIds.filter((fieldId): fieldId is typeof sourceFieldIds[number] => fieldId !== nextFieldId)
        }
      })]
    }

    const withoutCreated = currentFieldIds.filter(fieldId => fieldId !== nextFieldId)
    const nextFieldIds = [...withoutCreated]
    nextFieldIds.splice(Math.min(sourceIndex + 1, nextFieldIds.length), 0, nextFieldId)
    return [toViewPut({
      ...view,
      display: {
        fields: nextFieldIds
      }
    })]
  })

  return planResult(
    issues,
    [
      {
        type: 'document.field.put',
        field: nextField
      },
      ...buildCreateFieldViewOps(document, nextField),
      ...recordOps,
      ...viewOps
    ]
  )
}

const lowerFieldOptionCreate = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.option.create' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const context = requireOptionField(document, source, action.fieldId)
  if (!context.field || !context.options || hasValidationErrors(context.issues)) {
    return planResult(context.issues)
  }

  const explicitName = trimToUndefined(action.input?.name)
  if (action.input?.name !== undefined && !explicitName) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', 'Field option name must be a non-empty string', 'input.name'))
    return planResult(context.issues)
  }
  if (explicitName && findFieldOptionByName(context.options, explicitName)) {
    return planResult(context.issues)
  }

  const nextOption = createNextFieldOption(
    context.field,
    context.options,
    explicitName ?? createOptionName(context.options)
  )
  const patch = replaceFieldOptions(context.field, [...context.options, nextOption]) as Partial<Omit<CustomField, 'id'>>
  return planResult(context.issues, [toFieldPatch(action.fieldId, patch)])
}

const lowerFieldOptionReorder = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.option.reorder' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const context = requireOptionField(document, source, action.fieldId)
  if (!context.field || !context.options || hasValidationErrors(context.issues)) {
    return planResult(context.issues)
  }

  const optionMap = new Map(context.options.map(option => [option.id, option] as const))
  const seen = new Set<string>()
  const ordered = action.optionIds
    .map(optionId => {
      if (seen.has(optionId)) {
        return undefined
      }
      seen.add(optionId)
      return optionMap.get(optionId)
    })
    .filter((option): option is typeof context.options[number] => Boolean(option))

  const nextOptions = [...ordered, ...context.options.filter(option => !seen.has(option.id))]
  if (
    nextOptions.length === context.options.length
    && nextOptions.every((option, optionIndex) => option?.id === context.options[optionIndex]?.id)
  ) {
    return planResult(context.issues)
  }

  return planResult(context.issues, [toFieldPatch(action.fieldId, replaceFieldOptions(context.field, nextOptions) as Partial<Omit<CustomField, 'id'>>)])
}

const lowerFieldOptionUpdate = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.option.update' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const context = requireOptionField(document, source, action.fieldId)
  if (!context.field || !context.options || hasValidationErrors(context.issues)) {
    return planResult(context.issues)
  }

  const optionId = trimToUndefined(action.optionId)
  if (!optionId) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', 'Field option id must be a non-empty string', 'optionId'))
    return planResult(context.issues)
  }

  const target = context.options.find(option => option.id === optionId)
  if (!target) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', `Unknown field option: ${optionId}`, 'optionId'))
    return planResult(context.issues)
  }

  const nextName = trimToUndefined(action.patch.name)
  if (action.patch.name !== undefined) {
    if (!nextName) {
      context.issues.push(createIssue(source, 'error', 'field.invalid', 'Field option name must be a non-empty string', 'patch.name'))
      return planResult(context.issues)
    }

    const conflicting = findFieldOptionByName(context.options, nextName)
    if (conflicting && conflicting.id !== optionId) {
      context.issues.push(createIssue(source, 'error', 'field.invalid', `Duplicate field option name: ${nextName}`, 'patch.name'))
      return planResult(context.issues)
    }
  }

  const nextColor = action.patch.color === undefined
    ? undefined
    : trimToUndefined(action.patch.color) ?? null
  const nextOption = {
    ...target,
    ...(nextName ? { name: nextName } : {}),
    ...(nextColor !== undefined
      ? { color: nextColor }
      : {}),
    ...(context.field.kind === 'status' && action.patch.category !== undefined
      ? { category: action.patch.category }
      : {})
  }

  if (sameJsonValue(nextOption, target)) {
    return planResult(context.issues)
  }

  const patch = replaceFieldOptions(
    context.field,
    context.options.map(option => option.id === optionId ? nextOption : option)
  ) as Partial<Omit<CustomField, 'id'>>

  return planResult(context.issues, [toFieldPatch(action.fieldId, patch)])
}

const lowerFieldOptionRemove = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.option.remove' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const context = requireOptionField(document, source, action.fieldId)
  if (!context.field || !context.options || hasValidationErrors(context.issues)) {
    return planResult(context.issues)
  }

  const optionId = trimToUndefined(action.optionId)
  if (!optionId) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', 'Field option id must be a non-empty string', 'optionId'))
    return planResult(context.issues)
  }
  if (!context.options.some(option => option.id === optionId)) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', `Unknown field option: ${optionId}`, 'optionId'))
    return planResult(context.issues)
  }

  const patch = {
    ...replaceFieldOptions(
      context.field,
      context.options.filter(option => option.id !== optionId)
    ),
    ...(context.field.kind === 'status' && context.field.defaultOptionId === optionId
      ? { defaultOptionId: null }
      : {})
  } as Partial<Omit<CustomField, 'id'>>

  const valueOps: BaseOperation[] = []

  if (context.field.kind === 'select' || context.field.kind === 'status') {
    getDocumentRecords(document).forEach(record => {
      if (record.values[context.field.id] === optionId) {
        valueOps.push({
          type: 'document.value.clear',
          recordId: record.id,
          field: context.field.id
        })
      }
    })
  } else {
    getDocumentRecords(document).forEach(record => {
      const currentValue = record.values[context.field.id]
      if (!Array.isArray(currentValue)) {
        return
      }

      const nextValue = currentValue.filter(value => value !== optionId)
      if (nextValue.length === currentValue.length) {
        return
      }

      valueOps.push(
        nextValue.length
          ? {
              type: 'document.value.set',
              recordId: record.id,
              field: context.field.id,
              value: nextValue
            }
          : {
              type: 'document.value.clear',
              recordId: record.id,
              field: context.field.id
            }
      )
    })
  }

  return planResult(context.issues, [toFieldPatch(action.fieldId, patch), ...valueOps])
}

const lowerFieldRemove = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.remove' }>,
  index: number
): PlannedActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  return planResult(
    issues,
    [
      ...buildRemovedFieldViewOps(document, action.fieldId),
      {
        type: 'document.field.remove',
        fieldId: action.fieldId
      }
    ]
  )
}

export const planFieldAction = (
  document: DataDoc,
  action: Action,
  index: number
): PlannedActionResult => {
  switch (action.type) {
    case 'field.create':
      return lowerFieldCreate(document, action, index)
    case 'field.patch':
      return lowerFieldPatch(document, action, index)
    case 'field.replace':
      return lowerFieldReplace(document, action, index)
    case 'field.convert':
      return lowerFieldConvert(document, action, index)
    case 'field.duplicate':
      return lowerFieldDuplicate(document, action, index)
    case 'field.option.create':
      return lowerFieldOptionCreate(document, action, index)
    case 'field.option.reorder':
      return lowerFieldOptionReorder(document, action, index)
    case 'field.option.update':
      return lowerFieldOptionUpdate(document, action, index)
    case 'field.option.remove':
      return lowerFieldOptionRemove(document, action, index)
    case 'field.remove':
      return lowerFieldRemove(document, action, index)
    default:
      throw new Error(`Unsupported field planner action: ${action.type}`)
  }
}
