import type {
  Action,
  Command,
  CustomField,
  DataDoc,
  EditTarget,
  Field,
  FieldId,
  Filter,
  RecordId,
  DataRecord,
  Search,
  Sorter,
  View,
  ViewCalc,
  ViewDisplay,
  ViewGroup
} from '@dataview/core/contracts'
import type { GalleryOptions } from '@dataview/core/contracts/gallery'
import {
  KANBAN_CARDS_PER_COLUMN_OPTIONS,
  type KanbanOptions
} from '@dataview/core/contracts/kanban'
import type { RowInsertTarget } from '@dataview/core/contracts/operations'
import type { TableOptions } from '@dataview/core/contracts/viewOptions'
import {
  getDocumentCustomFieldById,
  getDocumentCustomFields,
  getDocumentFieldById,
  getDocumentFields,
  getDocumentRecordById,
  getDocumentRecords,
  getDocumentViewById,
  getDocumentViews,
  normalizeViewOrders
} from '@dataview/core/document'
import {
  isCalculationMetric,
  normalizeViewCalculations,
  supportsFieldCalculationMetric
} from '@dataview/core/calculation'
import {
  createDefaultCustomField,
  createUniqueFieldName,
  createUniqueFieldOptionToken,
  convertFieldKind,
  findFieldOptionByName,
  getFieldGroupMeta,
  getFieldOptions,
  getStatusFieldDefaultOption,
  hasFieldOptions,
  isGroupBucketSort,
  replaceFieldOptions
} from '@dataview/core/field'
import { hasFilterPreset } from '@dataview/core/filter'
import { normalizeViewQuery } from '@dataview/core/query'
import {
  repairViewForConvertedField,
  repairViewForRemovedField,
  resolveUniqueViewName
} from '@dataview/core/view'
import {
  createDefaultViewDisplay,
  createDefaultViewOptions
} from '@dataview/core/view/options'
import { cloneViewOptions } from '@dataview/core/view/shared'
import {
  sameJsonValue,
  sameOrder,
  sameShallowRecord
} from '@shared/core'
import { createIssue, hasValidationErrors, type IssueSource, type ValidationIssue } from '../command/issues'
import { isNonEmptyString, uniqueRecordIds } from '../command/shared'
import { validateField } from '../command/field/validate'
import { createPropertyId, createRecordId, createViewId } from '../command/entityId'

export interface LoweredCommand {
  index: number
  command: Command
}

export interface LowerActionResult {
  issues: ValidationIssue[]
  commands: LoweredCommand[]
}

const DEFAULT_OPTION_NAME = 'Option'
const sameRecordOrder = sameOrder<string>
const sameFieldIds = sameOrder<string>

const lowerResult = (
  issues: ValidationIssue[],
  commands: Command[] = [],
  index = 0
): LowerActionResult => ({
  issues,
  commands: hasValidationErrors(issues)
    ? []
    : commands.map(command => ({ index, command }))
})

const sourceOf = (
  index: number,
  action: Action
): IssueSource => ({
  index,
  type: action.type
})

const validateBatchItems = (
  source: IssueSource,
  items: readonly unknown[],
  path: string
) => items.length
  ? []
  : [createIssue(source, 'error', 'batch.emptyCollection', `${source.type} requires at least one item`, path)]

const validateTarget = (
  document: DataDoc,
  source: IssueSource,
  target: EditTarget
) => {
  if (target.type === 'record') {
    return getDocumentRecordById(document, target.recordId)
      ? []
      : [createIssue(source, 'error', 'record.notFound', `Unknown record: ${target.recordId}`, 'target.recordId')]
  }

  const issues = validateBatchItems(source, target.recordIds, 'target.recordIds')
  target.recordIds.forEach((recordId, index) => {
    if (!getDocumentRecordById(document, recordId)) {
      issues.push(createIssue(source, 'error', 'record.notFound', `Unknown record: ${recordId}`, `target.recordIds.${index}`))
    }
  })
  return issues
}

const listTargetRecordIds = (
  target: EditTarget
) => uniqueRecordIds(target) as RecordId[]

const validateFieldExists = (
  document: DataDoc,
  source: IssueSource,
  fieldId: string,
  path = 'fieldId'
) => getDocumentCustomFieldById(document, fieldId)
  ? []
  : [createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, path)]

const validateViewExists = (
  document: DataDoc,
  source: IssueSource,
  viewId: string,
  path = 'viewId'
) => getDocumentViewById(document, viewId)
  ? []
  : [createIssue(source, 'error', 'view.notFound', `Unknown view: ${viewId}`, path)]

const toViewPut = (
  view: View
): Command => ({
  type: 'view.put',
  view
})

const toFieldPatch = (
  fieldId: string,
  patch: Partial<Omit<CustomField, 'id'>>
): Command => ({
  type: 'field.patch',
  fieldId,
  patch
})

const buildCreateFieldViewCommands = (
  document: DataDoc,
  field: CustomField
): Command[] => (
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

const buildRemovedFieldViewCommands = (
  document: DataDoc,
  fieldId: string
): Command[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = repairViewForRemovedField(view, fieldId)
      return nextView === view
        ? []
        : [toViewPut(nextView)]
    })
)

const buildConvertedFieldViewCommands = (
  document: DataDoc,
  field: CustomField
): Command[] => (
  getDocumentViews(document)
    .flatMap(view => {
      const nextView = repairViewForConvertedField(view, field)
      return nextView === view
        ? []
        : [toViewPut(nextView)]
    })
)

const buildRecordRemoveViewCommands = (
  document: DataDoc,
  recordIds: readonly RecordId[]
): Command[] => {
  const removedRecordIdSet = new Set(recordIds)
  return getDocumentViews(document).flatMap(view => {
    const nextOrders = normalizeViewOrders(document, view.orders.filter(recordId => !removedRecordIdSet.has(recordId)))
    return sameRecordOrder(nextOrders, view.orders)
      ? []
      : [toViewPut({
          ...view,
          orders: nextOrders
        })]
  })
}

const resolveDefaultRecordType = (
  document: DataDoc
) => getDocumentRecords(document).find(record => typeof record.type === 'string' && record.type.length)?.type

const resolveRecordCreateValues = (
  document: DataDoc,
  explicitValues: Extract<Action, { type: 'record.create' }>['input']['values']
) => {
  const nextValues = {
    ...(explicitValues ?? {})
  }

  getDocumentCustomFields(document).forEach(field => {
    if (field.kind !== 'status') {
      return
    }
    if (explicitValues && Object.prototype.hasOwnProperty.call(explicitValues, field.id)) {
      return
    }
    const defaultOption = getStatusFieldDefaultOption(field)
    if (!defaultOption) {
      return
    }
    nextValues[field.id] = defaultOption.id
  })

  return nextValues
}

const lowerRecordCreate = (
  document: DataDoc,
  action: Extract<Action, { type: 'record.create' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const explicitRecordId = action.input.id?.trim()
  const issues = [
    ...(action.input.id !== undefined && !explicitRecordId
      ? [createIssue(source, 'error', 'record.invalidId', 'Record id must be a non-empty string', 'input.id')]
      : []),
    ...(explicitRecordId && getDocumentRecordById(document, explicitRecordId)
      ? [createIssue(source, 'error', 'record.duplicateId', `Record already exists: ${explicitRecordId}`, 'input.id')]
      : [])
  ]

  if (hasValidationErrors(issues)) {
    return lowerResult(issues, [], index)
  }

  const record = {
    id: explicitRecordId || createRecordId(),
    title: action.input.title?.trim() ?? '',
    type: action.input.type ?? resolveDefaultRecordType(document),
    values: resolveRecordCreateValues(document, action.input.values),
    meta: action.input.meta
  } satisfies DataRecord

  return lowerResult(issues, [{
    type: 'record.insert',
    records: [record]
  }], index)
}

const lowerRecordPatch = (
  document: DataDoc,
  action: Extract<Action, { type: 'record.patch' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateTarget(document, source, action.target)

  if (!Object.keys(action.patch).length) {
    issues.push(createIssue(source, 'error', 'record.emptyPatch', 'record.patch patch cannot be empty', 'patch'))
  }
  if (action.patch.values && typeof action.patch.values !== 'object') {
    issues.push(createIssue(source, 'error', 'record.emptyPatch', 'record.patch values patch must be an object', 'patch.values'))
  }

  return lowerResult(
    issues,
    listTargetRecordIds(action.target).map(recordId => ({
      type: 'record.patch',
      recordId,
      patch: action.patch
    })),
    index
  )
}

const lowerRecordRemove = (
  document: DataDoc,
  action: Extract<Action, { type: 'record.remove' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateBatchItems(source, action.recordIds, 'recordIds')
  action.recordIds.forEach((recordId, itemIndex) => {
    if (!getDocumentRecordById(document, recordId)) {
      issues.push(createIssue(source, 'error', 'record.notFound', `Unknown record: ${recordId}`, `recordIds.${itemIndex}`))
    }
  })
  return lowerResult(
    issues,
    [
      ...buildRecordRemoveViewCommands(document, action.recordIds),
      {
        type: 'record.remove',
        recordIds: action.recordIds
      }
    ],
    index
  )
}

const lowerValueSet = (
  document: DataDoc,
  action: Extract<Action, { type: 'value.set' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateTarget(document, source, action.target)
  if (!isNonEmptyString(action.field)) {
    issues.push(createIssue(source, 'error', 'value.invalidField', 'value.set requires a non-empty field', 'field'))
  }
  return lowerResult(
    issues,
    listTargetRecordIds(action.target).map(recordId => ({
      type: 'value.set',
      recordId,
      field: action.field,
      value: action.value
    })),
    index
  )
}

const lowerValuePatch = (
  document: DataDoc,
  action: Extract<Action, { type: 'value.patch' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateTarget(document, source, action.target)
  if (!Object.keys(action.patch).length) {
    issues.push(createIssue(source, 'error', 'value.emptyPatch', 'value.patch patch cannot be empty', 'patch'))
  }
  return lowerResult(
    issues,
    listTargetRecordIds(action.target).map(recordId => ({
      type: 'value.patch',
      recordId,
      patch: action.patch
    })),
    index
  )
}

const lowerValueClear = (
  document: DataDoc,
  action: Extract<Action, { type: 'value.clear' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateTarget(document, source, action.target)
  if (!isNonEmptyString(action.field)) {
    issues.push(createIssue(source, 'error', 'value.invalidField', 'value.clear requires a non-empty field', 'field'))
  }
  return lowerResult(
    issues,
    listTargetRecordIds(action.target).map(recordId => ({
      type: 'value.clear',
      recordId,
      field: action.field
    })),
    index
  )
}

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
): LowerActionResult => {
  const source = sourceOf(index, action)
  const explicitFieldId = action.input.id?.trim()
  const issues: ValidationIssue[] = []

  if (action.input.id !== undefined && !explicitFieldId) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'Field id must be a non-empty string', 'input.id'))
  }
  if (explicitFieldId && getDocumentCustomFieldById(document, explicitFieldId)) {
    issues.push(createIssue(source, 'error', 'field.invalid', `Field already exists: ${explicitFieldId}`, 'input.id'))
  }

  if (hasValidationErrors(issues)) {
    return lowerResult(issues, [], index)
  }

  const field = createDefaultCustomField({
    id: explicitFieldId || createPropertyId(),
    name: action.input.name,
    kind: action.input.kind ?? 'text',
    meta: action.input.meta
  })

  const fieldIssues = validateField(document, source, field, 'input')
  return lowerResult(
    [...issues, ...fieldIssues],
    [
      {
        type: 'field.put',
        field
      },
      ...buildCreateFieldViewCommands(document, field)
    ],
    index
  )
}

const lowerFieldPatch = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.patch' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  const field = getDocumentCustomFieldById(document, action.fieldId)

  if (!field || hasValidationErrors(issues)) {
    return lowerResult(issues, [], index)
  }

  if (!Object.keys(action.patch).length) {
    issues.push(createIssue(source, 'error', 'field.invalid', 'field.patch patch cannot be empty', 'patch'))
    return lowerResult(issues, [], index)
  }

  const nextField = {
    ...field,
    ...(action.patch as Partial<CustomField>)
  } as CustomField
  issues.push(...validateField(document, source, nextField, 'patch'))

  return lowerResult(issues, [toFieldPatch(action.fieldId, action.patch)], index)
}

const lowerFieldReplace = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.replace' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  const field = {
    ...structuredClone(action.field),
    id: action.fieldId
  } satisfies CustomField

  issues.push(...validateField(document, source, field, 'field'))
  return lowerResult(issues, [{
    type: 'field.put',
    field
  }], index)
}

const lowerFieldConvert = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.convert' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  const field = getDocumentCustomFieldById(document, action.fieldId)
  if (!field || hasValidationErrors(issues)) {
    return lowerResult(issues, [], index)
  }

  const patch = createFieldConvertPatch(field, action.input)
  const nextField = {
    ...field,
    ...patch
  } as CustomField
  issues.push(...validateField(document, source, nextField, 'input'))

  return lowerResult(
    issues,
    [
      toFieldPatch(action.fieldId, patch),
      ...buildConvertedFieldViewCommands(document, nextField)
    ],
    index
  )
}

const lowerFieldDuplicate = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.duplicate' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  const sourceField = getDocumentCustomFieldById(document, action.fieldId)
  if (!sourceField || hasValidationErrors(issues)) {
    return lowerResult(issues, [], index)
  }

  const nextFieldId = createPropertyId()
  const nextField: CustomField = {
    ...structuredClone(sourceField),
    id: nextFieldId,
    name: createUniqueFieldName(`${sourceField.name} Copy`, getDocumentCustomFields(document))
  }
  issues.push(...validateField(document, source, nextField, 'field'))

  const recordCommands: Command[] = getDocumentRecords(document).flatMap(record => (
    Object.prototype.hasOwnProperty.call(record.values, sourceField.id)
      ? [{
          type: 'value.set' as const,
          recordId: record.id,
          field: nextFieldId,
          value: structuredClone(record.values[sourceField.id])
        }]
      : []
  ))

  const viewCommands: Command[] = getDocumentViews(document).flatMap(view => {
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

  return lowerResult(
    issues,
    [
      {
        type: 'field.put',
        field: nextField
      },
      ...buildCreateFieldViewCommands(document, nextField),
      ...recordCommands,
      ...viewCommands
    ],
    index
  )
}

const lowerFieldOptionCreate = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.option.create' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const context = requireOptionField(document, source, action.fieldId)
  if (!context.field || !context.options || hasValidationErrors(context.issues)) {
    return lowerResult(context.issues, [], index)
  }

  const explicitName = action.input?.name?.trim()
  if (action.input?.name !== undefined && !explicitName) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', 'Field option name must be a non-empty string', 'input.name'))
    return lowerResult(context.issues, [], index)
  }
  if (explicitName && findFieldOptionByName(context.options, explicitName)) {
    return lowerResult(context.issues, [], index)
  }

  const nextOption = createNextFieldOption(
    context.field,
    context.options,
    explicitName ?? createOptionName(context.options)
  )
  const patch = replaceFieldOptions(context.field, [...context.options, nextOption]) as Partial<Omit<CustomField, 'id'>>
  return lowerResult(context.issues, [toFieldPatch(action.fieldId, patch)], index)
}

const lowerFieldOptionReorder = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.option.reorder' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const context = requireOptionField(document, source, action.fieldId)
  if (!context.field || !context.options || hasValidationErrors(context.issues)) {
    return lowerResult(context.issues, [], index)
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
    return lowerResult(context.issues, [], index)
  }

  return lowerResult(context.issues, [toFieldPatch(action.fieldId, replaceFieldOptions(context.field, nextOptions) as Partial<Omit<CustomField, 'id'>>)], index)
}

const lowerFieldOptionUpdate = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.option.update' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const context = requireOptionField(document, source, action.fieldId)
  if (!context.field || !context.options || hasValidationErrors(context.issues)) {
    return lowerResult(context.issues, [], index)
  }

  const optionId = action.optionId.trim()
  if (!optionId) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', 'Field option id must be a non-empty string', 'optionId'))
    return lowerResult(context.issues, [], index)
  }

  const target = context.options.find(option => option.id === optionId)
  if (!target) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', `Unknown field option: ${optionId}`, 'optionId'))
    return lowerResult(context.issues, [], index)
  }

  const nextName = action.patch.name?.trim()
  if (action.patch.name !== undefined) {
    if (!nextName) {
      context.issues.push(createIssue(source, 'error', 'field.invalid', 'Field option name must be a non-empty string', 'patch.name'))
      return lowerResult(context.issues, [], index)
    }

    const conflicting = findFieldOptionByName(context.options, nextName)
    if (conflicting && conflicting.id !== optionId) {
      context.issues.push(createIssue(source, 'error', 'field.invalid', `Duplicate field option name: ${nextName}`, 'patch.name'))
      return lowerResult(context.issues, [], index)
    }
  }

  const nextOption = {
    ...target,
    ...(nextName ? { name: nextName } : {}),
    ...(action.patch.color !== undefined
      ? (action.patch.color.trim()
          ? { color: action.patch.color.trim() }
          : { color: null })
      : {}),
    ...(context.field.kind === 'status' && action.patch.category !== undefined
      ? { category: action.patch.category }
      : {})
  }

  if (sameJsonValue(nextOption, target)) {
    return lowerResult(context.issues, [], index)
  }

  const patch = replaceFieldOptions(
    context.field,
    context.options.map(option => option.id === optionId ? nextOption : option)
  ) as Partial<Omit<CustomField, 'id'>>

  return lowerResult(context.issues, [toFieldPatch(action.fieldId, patch)], index)
}

const lowerFieldOptionRemove = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.option.remove' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const context = requireOptionField(document, source, action.fieldId)
  if (!context.field || !context.options || hasValidationErrors(context.issues)) {
    return lowerResult(context.issues, [], index)
  }

  const optionId = action.optionId.trim()
  if (!optionId) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', 'Field option id must be a non-empty string', 'optionId'))
    return lowerResult(context.issues, [], index)
  }
  if (!context.options.some(option => option.id === optionId)) {
    context.issues.push(createIssue(source, 'error', 'field.invalid', `Unknown field option: ${optionId}`, 'optionId'))
    return lowerResult(context.issues, [], index)
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

  const valueCommands: Command[] = []

  if (context.field.kind === 'select' || context.field.kind === 'status') {
    getDocumentRecords(document).forEach(record => {
      if (record.values[context.field.id] === optionId) {
        valueCommands.push({
          type: 'value.clear',
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

      valueCommands.push(
        nextValue.length
          ? {
              type: 'value.set',
              recordId: record.id,
              field: context.field.id,
              value: nextValue
            }
          : {
              type: 'value.clear',
              recordId: record.id,
              field: context.field.id
            }
      )
    })
  }

  return lowerResult(context.issues, [toFieldPatch(action.fieldId, patch), ...valueCommands], index)
}

const lowerFieldRemove = (
  document: DataDoc,
  action: Extract<Action, { type: 'field.remove' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateFieldExists(document, source, action.fieldId)
  return lowerResult(
    issues,
    [
      ...buildRemovedFieldViewCommands(document, action.fieldId),
      {
        type: 'field.remove',
        fieldId: action.fieldId
      }
    ],
    index
  )
}

const sameWidths = (
  left: TableOptions['widths'],
  right: TableOptions['widths']
) => sameShallowRecord(left, right)

const calculationEntries = (
  calc: ViewCalc
) => Object.entries(calc).sort(([left], [right]) => left.localeCompare(right))

const sameCalc = (
  left: ViewCalc,
  right: ViewCalc
) => sameJsonValue(calculationEntries(left), calculationEntries(right))

const sameDisplay = (
  left: ViewDisplay,
  right: ViewDisplay
) => sameFieldIds(left.fields, right.fields)

const sameSearch = (
  left: Search,
  right: Search
) => left.query === right.query && sameFieldIds(left.fields ?? [], right.fields ?? [])

const sameFilterRule = (
  left: Filter['rules'][number],
  right: Filter['rules'][number]
) => sameJsonValue(left, right)

const sameFilter = (
  left: Filter,
  right: Filter
) => left.mode === right.mode && left.rules.length === right.rules.length && left.rules.every((rule, index) => sameFilterRule(rule, right.rules[index]!))

const sameSorters = (
  left: readonly Sorter[],
  right: readonly Sorter[]
) => left.length === right.length && left.every((sorter, index) => sorter.field === right[index]?.field && sorter.direction === right[index]?.direction)

const sameGroup = (
  left: ViewGroup | undefined,
  right: ViewGroup | undefined
) => sameJsonValue(left, right)

const sameViewOptions = (
  left: View['options'],
  right: View['options']
) => (
  sameWidths(left.table.widths, right.table.widths)
  && left.table.showVerticalLines === right.table.showVerticalLines
  && left.gallery.showFieldLabels === right.gallery.showFieldLabels
  && left.gallery.cardSize === right.gallery.cardSize
  && left.kanban.newRecordPosition === right.kanban.newRecordPosition
  && left.kanban.fillColumnColor === right.kanban.fillColumnColor
  && left.kanban.cardsPerColumn === right.kanban.cardsPerColumn
)

const cloneSearch = (search: Search): Search => ({
  query: search.query,
  ...(search.fields ? { fields: [...search.fields] } : {})
})

const cloneFilter = (filter: Filter): Filter => structuredClone(filter)
const cloneSorters = (sorters: readonly Sorter[]): Sorter[] => sorters.map(sorter => ({ ...sorter }))
const cloneGroup = (group: ViewGroup): ViewGroup => structuredClone(group)
const cloneCalc = (calc: ViewCalc): ViewCalc => structuredClone(calc)
const cloneDisplay = (display: ViewDisplay): ViewDisplay => ({ fields: [...display.fields] })

const validateFieldIdList = (
  document: DataDoc,
  source: IssueSource,
  fieldIds: readonly unknown[],
  path: string
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()

  fieldIds.forEach((fieldId, index) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'field id must be a non-empty string', `${path}.${index}`))
      return
    }
    if (seen.has(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Duplicate field id: ${fieldId}`, `${path}.${index}`))
      return
    }
    seen.add(fieldId)
    if (!getDocumentFieldById(document, fieldId)) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${index}`))
    }
  })

  return issues
}

const validateSearch = (
  document: DataDoc,
  source: IssueSource,
  search: Search,
  path = 'view.search'
) => {
  const issues: ValidationIssue[] = []
  if (typeof search.query !== 'string') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Search query must be a string', `${path}.query`))
  }
  if (search.fields) {
    issues.push(...validateFieldIdList(document, source, search.fields, `${path}.fields`))
  }
  return issues
}

const validateFilter = (
  document: DataDoc,
  source: IssueSource,
  filter: Filter,
  path = 'view.filter'
) => {
  const issues: ValidationIssue[] = []
  filter.rules.forEach((rule, index) => {
    if (!isNonEmptyString(rule.fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Filter field id must be a non-empty string', `${path}.rules.${index}.fieldId`))
      return
    }
    if (!isNonEmptyString(rule.presetId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Filter preset id must be a non-empty string', `${path}.rules.${index}.presetId`))
      return
    }
    const field = getDocumentFieldById(document, rule.fieldId)
    if (!field) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${rule.fieldId}`, `${path}.rules.${index}.fieldId`))
      return
    }
    if (!hasFilterPreset(field, rule.presetId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Filter preset ${rule.presetId} is invalid for ${field.kind} fields`, `${path}.rules.${index}.presetId`))
    }
  })
  return issues
}

const validateSorters = (
  document: DataDoc,
  source: IssueSource,
  sorters: readonly Sorter[],
  path = 'view.sort'
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  sorters.forEach((sorter, index) => {
    if (!isNonEmptyString(sorter.field)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Sorter field must be a non-empty string', `${path}.${index}.field`))
    } else if (!getDocumentFieldById(document, sorter.field)) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${sorter.field}`, `${path}.${index}.field`))
    } else if (seen.has(sorter.field)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Duplicate sorter field: ${sorter.field}`, `${path}.${index}.field`))
    } else {
      seen.add(sorter.field)
    }

    if (sorter.direction !== 'asc' && sorter.direction !== 'desc') {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Sorter direction must be asc or desc', `${path}.${index}.direction`))
    }
  })
  return issues
}

const validateGroup = (
  document: DataDoc,
  source: IssueSource,
  group: ViewGroup | undefined,
  path = 'view.group'
) => {
  if (!group) {
    return []
  }

  const issues = isNonEmptyString(group.field)
    ? []
    : [createIssue(source, 'error', 'view.invalidProjection', 'group field must be a non-empty string', `${path}.field`)]

  const field = isNonEmptyString(group.field)
    ? getDocumentFieldById(document, group.field)
    : undefined
  const fieldGroupMeta = field ? getFieldGroupMeta(field) : undefined
  const fieldGroupMetaForMode = field ? getFieldGroupMeta(field, { mode: group.mode }) : undefined

  if (!field) {
    issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${group.field}`, `${path}.field`))
  }
  if (!isNonEmptyString(group.mode)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group mode must be a non-empty string', `${path}.mode`))
  } else if (field && (!fieldGroupMeta?.modes.length || !fieldGroupMeta.modes.includes(group.mode))) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group mode is invalid for this field', `${path}.mode`))
  }
  if (!isGroupBucketSort(group.bucketSort)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group bucketSort is invalid', `${path}.bucketSort`))
  } else if (field && !fieldGroupMetaForMode?.sorts.includes(group.bucketSort)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group bucketSort is invalid for this field', `${path}.bucketSort`))
  }
  if (group.bucketInterval !== undefined) {
    if (typeof group.bucketInterval !== 'number' || !Number.isFinite(group.bucketInterval) || group.bucketInterval <= 0) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group bucketInterval must be a positive finite number', `${path}.bucketInterval`))
    } else if (field && !fieldGroupMetaForMode?.supportsInterval) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'group bucketInterval is invalid for this field', `${path}.bucketInterval`))
    }
  }
  return issues
}

const validateDisplay = (
  document: DataDoc,
  source: IssueSource,
  display: ViewDisplay,
  path = 'view.display'
) => validateFieldIdList(document, source, display.fields, `${path}.fields`)

const validateTableOptions = (
  document: DataDoc,
  source: IssueSource,
  table: TableOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  Object.entries(table.widths).forEach(([fieldId, width]) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'width field id must be a non-empty string', `${path}.widths`))
      return
    }
    if (!getDocumentFieldById(document, fieldId)) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.widths.${fieldId}`))
    }
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'column width must be a positive finite number', `${path}.widths.${fieldId}`))
    }
  })
  if (typeof table.showVerticalLines !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'table.showVerticalLines must be boolean', `${path}.showVerticalLines`))
  }
  return issues
}

const validateGalleryOptions = (
  source: IssueSource,
  gallery: GalleryOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  if (typeof gallery.showFieldLabels !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'gallery.showFieldLabels must be boolean', `${path}.showFieldLabels`))
  }
  if (!['sm', 'md', 'lg'].includes(gallery.cardSize)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'gallery.cardSize is invalid', `${path}.cardSize`))
  }
  return issues
}

const validateKanbanOptions = (
  source: IssueSource,
  kanban: KanbanOptions,
  path: string
) => {
  const issues: ValidationIssue[] = []
  if (kanban.newRecordPosition !== 'start' && kanban.newRecordPosition !== 'end') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.newRecordPosition is invalid', `${path}.newRecordPosition`))
  }
  if (typeof kanban.fillColumnColor !== 'boolean') {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.fillColumnColor must be boolean', `${path}.fillColumnColor`))
  }
  if (!KANBAN_CARDS_PER_COLUMN_OPTIONS.includes(kanban.cardsPerColumn)) {
    issues.push(createIssue(source, 'error', 'view.invalidProjection', 'kanban.cardsPerColumn is invalid', `${path}.cardsPerColumn`))
  }
  return issues
}

const validateViewOptions = (
  document: DataDoc,
  source: IssueSource,
  options: View['options'],
  path = 'view.options'
) => [
  ...validateTableOptions(document, source, options.table, `${path}.table`),
  ...validateGalleryOptions(source, options.gallery, `${path}.gallery`),
  ...validateKanbanOptions(source, options.kanban, `${path}.kanban`)
]

const validateOrders = (
  document: DataDoc,
  source: IssueSource,
  orders: readonly string[],
  path = 'view.orders'
) => {
  const issues: ValidationIssue[] = []
  const seen = new Set<string>()
  orders.forEach((recordId, index) => {
    if (!isNonEmptyString(recordId)) {
      issues.push(createIssue(source, 'error', 'view.invalidOrder', 'orders must only contain non-empty record ids', `${path}.${index}`))
      return
    }
    if (seen.has(recordId)) {
      issues.push(createIssue(source, 'error', 'view.invalidOrder', `Duplicate record id: ${recordId}`, `${path}.${index}`))
      return
    }
    seen.add(recordId)
    if (!getDocumentRecordById(document, recordId)) {
      issues.push(createIssue(source, 'error', 'record.notFound', `Unknown record: ${recordId}`, `${path}.${index}`))
    }
  })
  return issues
}

const validateCalc = (
  document: DataDoc,
  source: IssueSource,
  calc: ViewCalc,
  path = 'view.calc'
) => {
  const issues: ValidationIssue[] = []
  Object.entries(calc).forEach(([fieldId, metric]) => {
    if (!isNonEmptyString(fieldId)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Calculation field must be a non-empty string', path))
      return
    }
    const field = getDocumentFieldById(document, fieldId as FieldId)
    if (!field) {
      issues.push(createIssue(source, 'error', 'field.notFound', `Unknown field: ${fieldId}`, `${path}.${fieldId}`))
      return
    }
    if (!isCalculationMetric(metric)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', 'Calculation metric is invalid', `${path}.${fieldId}`))
      return
    }
    if (!supportsFieldCalculationMetric(field, metric)) {
      issues.push(createIssue(source, 'error', 'view.invalidProjection', `Calculation metric ${metric} is invalid for ${field.kind} fields`, `${path}.${fieldId}`))
    }
  })
  return issues
}

const validateView = (
  document: DataDoc,
  source: IssueSource,
  view: View
) => {
  const issues: ValidationIssue[] = []
  if (!isNonEmptyString(view.id)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View id must be a non-empty string', 'view.id'))
  }
  if (!isNonEmptyString(view.name)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View name must be a non-empty string', 'view.name'))
  }
  if (!isNonEmptyString(view.type)) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View type must be a non-empty string', 'view.type'))
  }

  issues.push(
    ...validateSearch(document, source, view.search),
    ...validateFilter(document, source, view.filter),
    ...validateSorters(document, source, view.sort),
    ...validateGroup(document, source, view.group),
    ...validateCalc(document, source, view.calc),
    ...validateDisplay(document, source, view.display),
    ...validateViewOptions(document, source, view.options),
    ...validateOrders(document, source, view.orders)
  )

  return issues
}

const applyViewPatch = (
  view: View,
  patch: Extract<Action, { type: 'view.patch' }>['patch']
): View => {
  let next = view
  const ensureMutable = () => {
    if (next === view) {
      next = { ...view }
    }
    return next
  }

  if (patch.name !== undefined && patch.name !== view.name) {
    ensureMutable().name = patch.name
  }
  if (patch.type !== undefined && patch.type !== view.type) {
    ensureMutable().type = patch.type
  }
  if (patch.search !== undefined && !sameSearch(view.search, patch.search)) {
    ensureMutable().search = cloneSearch(patch.search)
  }
  if (patch.filter !== undefined && !sameFilter(view.filter, patch.filter)) {
    ensureMutable().filter = cloneFilter(patch.filter)
  }
  if (patch.sort !== undefined && !sameSorters(view.sort, patch.sort)) {
    ensureMutable().sort = cloneSorters(patch.sort)
  }
  if (patch.group !== undefined) {
    const nextGroup = patch.group === null ? undefined : patch.group
    if (!sameGroup(view.group, nextGroup)) {
      const nextView = ensureMutable()
      if (nextGroup) {
        nextView.group = cloneGroup(nextGroup)
      } else {
        delete (nextView as View & { group?: ViewGroup }).group
      }
    }
  }
  if (patch.calc !== undefined && !sameCalc(view.calc, patch.calc)) {
    ensureMutable().calc = cloneCalc(patch.calc)
  }
  if (patch.display !== undefined && !sameDisplay(view.display, patch.display)) {
    ensureMutable().display = cloneDisplay(patch.display)
  }
  if (patch.options !== undefined && !sameViewOptions(view.options, patch.options)) {
    ensureMutable().options = cloneViewOptions(patch.options)
  }
  if (patch.orders !== undefined && !sameRecordOrder(view.orders, patch.orders)) {
    ensureMutable().orders = [...patch.orders]
  }
  return next
}

const normalizeView = (
  document: DataDoc,
  view: View
): View => {
  const fields = getDocumentFields(document)
  const query = normalizeViewQuery({
    search: view.search,
    filter: view.filter,
    sort: view.sort,
    ...(view.group ? { group: view.group } : {})
  })

  return {
    ...view,
    search: query.search,
    filter: query.filter,
    sort: query.sort,
    ...(query.group ? { group: query.group } : {}),
    ...(!query.group ? { group: undefined } : {}),
    calc: normalizeViewCalculations(view.calc, {
      fields: new Map(fields.map(field => [field.id, field] as const))
    }),
    display: cloneDisplay(view.display),
    options: cloneViewOptions(view.options),
    orders: [...view.orders]
  }
}

const lowerViewCreate = (
  document: DataDoc,
  action: Extract<Action, { type: 'view.create' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const explicitViewId = action.input.id?.trim()
  const preferredName = action.input.name.trim()
  const issues: ValidationIssue[] = []

  if (action.input.id !== undefined && !explicitViewId) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View id must be a non-empty string', 'input.id'))
  }
  if (explicitViewId && getDocumentViewById(document, explicitViewId)) {
    issues.push(createIssue(source, 'error', 'view.invalid', `View already exists: ${explicitViewId}`, 'input.id'))
  }
  if (!preferredName) {
    issues.push(createIssue(source, 'error', 'view.invalid', 'View name must be a non-empty string', 'input.name'))
  }
  if (hasValidationErrors(issues)) {
    return lowerResult(issues, [], index)
  }

  const fields = getDocumentFields(document)
  const view = normalizeView(document, {
    id: explicitViewId || createViewId(),
    name: resolveUniqueViewName({
      views: getDocumentViews(document),
      preferredName
    }),
    type: action.input.type,
    search: action.input.search ?? { query: '' },
    filter: action.input.filter ?? { mode: 'and', rules: [] },
    sort: action.input.sort ?? [],
    ...(action.input.group ? { group: action.input.group } : {}),
    calc: action.input.calc ?? {},
    display: action.input.display
      ? cloneDisplay(action.input.display)
      : createDefaultViewDisplay(action.input.type, fields),
    options: action.input.options
      ? cloneViewOptions(action.input.options)
      : createDefaultViewOptions(action.input.type, fields),
    orders: action.input.orders ? [...action.input.orders] : []
  } satisfies View)

  issues.push(...validateView(document, source, view))
  return lowerResult(issues, [toViewPut(view)], index)
}

const lowerViewPatch = (
  document: DataDoc,
  action: Extract<Action, { type: 'view.patch' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateViewExists(document, source, action.viewId)
  const view = getDocumentViewById(document, action.viewId)
  if (!view || hasValidationErrors(issues)) {
    return lowerResult(issues, [], index)
  }

  const nextView = normalizeView(document, applyViewPatch(view, action.patch))
  if (sameJsonValue(nextView, view)) {
    return lowerResult(issues, [], index)
  }

  issues.push(...validateView(document, source, nextView))
  return lowerResult(issues, [toViewPut(nextView)], index)
}

const lowerViewOpen = (
  document: DataDoc,
  action: Extract<Action, { type: 'view.open' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateViewExists(document, source, action.viewId)
  return lowerResult(
    issues,
    getDocumentViewById(document, action.viewId)
      ? [{
          type: 'activeView.set',
          viewId: action.viewId
        }]
      : [],
    index
  )
}

const lowerViewRemove = (
  document: DataDoc,
  action: Extract<Action, { type: 'view.remove' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = validateViewExists(document, source, action.viewId)
  return lowerResult(issues, [{
    type: 'view.remove',
    viewId: action.viewId
  }], index)
}

const lowerExternalBump = (
  _document: DataDoc,
  action: Extract<Action, { type: 'external.bumpVersion' }>,
  index: number
): LowerActionResult => {
  const source = sourceOf(index, action)
  const issues = isNonEmptyString(action.source)
    ? []
    : [createIssue(source, 'error', 'external.invalidSource', 'external.bumpVersion requires a non-empty source', 'source')]

  return lowerResult(issues, [{
    type: 'external.bumpVersion',
    source: action.source
  }], index)
}

export const lowerAction = (
  document: DataDoc,
  action: Action,
  index: number
): LowerActionResult => {
  switch (action.type) {
    case 'record.create':
      return lowerRecordCreate(document, action, index)
    case 'record.patch':
      return lowerRecordPatch(document, action, index)
    case 'record.remove':
      return lowerRecordRemove(document, action, index)
    case 'value.set':
      return lowerValueSet(document, action, index)
    case 'value.patch':
      return lowerValuePatch(document, action, index)
    case 'value.clear':
      return lowerValueClear(document, action, index)
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
    case 'view.create':
      return lowerViewCreate(document, action, index)
    case 'view.patch':
      return lowerViewPatch(document, action, index)
    case 'view.open':
      return lowerViewOpen(document, action, index)
    case 'view.remove':
      return lowerViewRemove(document, action, index)
    case 'external.bumpVersion':
      return lowerExternalBump(document, action, index)
    default: {
      const unexpectedAction: never = action
      throw new Error(`Unsupported action: ${unexpectedAction}`)
    }
  }
}
