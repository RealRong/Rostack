import type {
  Action,
  CustomField,
  FieldId,
  RecordId,
  View
} from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import {
  createDefaultCustomField,
  createUniqueFieldName,
  createUniqueFieldOptionToken,
  convertFieldKind,
  findFieldOptionByName,
  getFieldOptions,
  hasFieldOptions,
  isCustomField,
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
import { validateField } from '@dataview/engine/mutate/validate/field'
import type {
  PlannedActionResult,
  PlannerScope
} from '@dataview/engine/mutate/planner/scope'

const DEFAULT_OPTION_NAME = 'Option'

const toViewPut = (
  view: View
): DocumentOperation => ({
  type: 'document.view.put',
  view
})

const toFieldPatch = (
  fieldId: string,
  patch: Partial<Omit<CustomField, 'id'>>
): DocumentOperation => ({
  type: 'document.field.patch',
  fieldId,
  patch
})

const toRecordFieldWriteMany = (input: {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}): DocumentOperation => ({
  type: 'document.record.fields.writeMany',
  recordIds: input.recordIds,
  ...(input.set && Object.keys(input.set).length
    ? { set: input.set }
    : {}),
  ...(input.clear?.length
    ? { clear: input.clear }
    : {})
})

const toSingleRecordFieldWrite = (
  recordId: RecordId,
  fieldId: FieldId,
  value: unknown | undefined
): DocumentOperation => value === undefined
  ? toRecordFieldWriteMany({
      recordIds: [recordId],
      clear: [fieldId]
    })
  : toRecordFieldWriteMany({
      recordIds: [recordId],
      set: {
        [fieldId]: value
      }
    })

const buildRemovedFieldViewOps = (
  views: readonly View[],
  fieldId: string
): DocumentOperation[] => (
  views
    .flatMap(view => {
      const nextView = repairViewForRemovedField(view, fieldId)
      return nextView === view
        ? []
        : [toViewPut(nextView)]
    })
)

const buildConvertedFieldViewOps = (
  views: readonly View[],
  field: CustomField
): DocumentOperation[] => (
  views
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

const requireCustomField = (
  scope: PlannerScope,
  fieldId: string,
  path = 'fieldId'
): CustomField | undefined => {
  const field = scope.reader.fields.get(fieldId)
  if (!isCustomField(field)) {
    scope.issue(
      'field.notFound',
      `Unknown field: ${fieldId}`,
      path
    )
    return undefined
  }

  return field
}

const requireOptionField = (
  scope: PlannerScope,
  fieldId: string
) => {
  const field = requireCustomField(scope, fieldId)
  if (!field) {
    return undefined
  }
  if (!hasFieldOptions(field)) {
    scope.issue(
      'field.invalid',
      'Field does not support options',
      'fieldId'
    )
    return undefined
  }

  return {
    field,
    options: getFieldOptions(field)
  }
}

const lowerFieldCreate = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.create' }>
): PlannedActionResult => {
  const document = scope.reader.document()
  const explicitFieldId = trimToUndefined(action.input.id)

  if (action.input.id !== undefined && !explicitFieldId) {
    scope.issue(
      'field.invalid',
      'Field id must be a non-empty string',
      'input.id'
    )
  }
  if (explicitFieldId && scope.reader.fields.has(explicitFieldId)) {
    scope.issue(
      'field.invalid',
      `Field already exists: ${explicitFieldId}`,
      'input.id'
    )
  }
  if ((action.input.id !== undefined && !explicitFieldId) || (explicitFieldId && scope.reader.fields.has(explicitFieldId))) {
    return scope.finish()
  }

  const field = createDefaultCustomField({
    id: explicitFieldId || createFieldId(),
    name: action.input.name,
    kind: action.input.kind ?? 'text',
    meta: action.input.meta
  })

  scope.report(...validateField(document, scope.source, field, 'input'))
  return scope.finish({
    type: 'document.field.put',
    field
  })
}

const lowerFieldPatch = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.patch' }>
): PlannedActionResult => {
  const document = scope.reader.document()
  const views = scope.reader.views.list()
  const field = requireCustomField(scope, action.fieldId)
  if (!field) {
    return scope.finish()
  }

  if (!Object.keys(action.patch).length) {
    scope.issue(
      'field.invalid',
      'field.patch patch cannot be empty',
      'patch'
    )
    return scope.finish()
  }

  const nextField = {
    ...field,
    ...(action.patch as Partial<CustomField>)
  } as CustomField
  scope.report(...validateField(document, scope.source, nextField, 'patch'))

  return scope.finish(toFieldPatch(action.fieldId, action.patch))
}

const lowerFieldReplace = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.replace' }>
): PlannedActionResult => {
  const document = scope.reader.document()
  if (!requireCustomField(scope, action.fieldId)) {
    return scope.finish()
  }

  const field = {
    ...structuredClone(action.field),
    id: action.fieldId
  } satisfies CustomField

  scope.report(...validateField(document, scope.source, field, 'field'))
  return scope.finish({
    type: 'document.field.put',
    field
  })
}

const lowerFieldConvert = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.convert' }>
): PlannedActionResult => {
  const document = scope.reader.document()
  const views = scope.reader.views.list()
  const field = requireCustomField(scope, action.fieldId)
  if (!field) {
    return scope.finish()
  }

  const patch = createFieldConvertPatch(field, action.input)
  const nextField = {
    ...field,
    ...patch
  } as CustomField
  scope.report(...validateField(document, scope.source, nextField, 'input'))

  return scope.finish(
    toFieldPatch(action.fieldId, patch),
    ...buildConvertedFieldViewOps(views, nextField)
  )
}

const lowerFieldDuplicate = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.duplicate' }>
): PlannedActionResult => {
  const document = scope.reader.document()
  const views = scope.reader.views.list()
  const records = scope.reader.records.list()
  const sourceField = requireCustomField(scope, action.fieldId)
  if (!sourceField) {
    return scope.finish()
  }

  const nextFieldId = createFieldId()
  const nextField: CustomField = {
    ...structuredClone(sourceField),
    id: nextFieldId,
    name: createUniqueFieldName(
      `${sourceField.name} Copy`,
      scope.reader.fields.list().filter(isCustomField)
    )
  }
  scope.report(...validateField(document, scope.source, nextField, 'field'))

  const recordOps: DocumentOperation[] = records.flatMap(record => (
    Object.prototype.hasOwnProperty.call(record.values, sourceField.id)
      ? [toSingleRecordFieldWrite(
          record.id,
          nextFieldId,
          structuredClone(record.values[sourceField.id])
        )]
      : []
  ))

  const viewOps: DocumentOperation[] = views.flatMap(view => {
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

  return scope.finish(
    {
      type: 'document.field.put',
      field: nextField
    },
    ...recordOps,
    ...viewOps
  )
}

const lowerFieldOptionCreate = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.option.create' }>
): PlannedActionResult => {
  const context = requireOptionField(scope, action.fieldId)
  if (!context) {
    return scope.finish()
  }

  const explicitName = trimToUndefined(action.input?.name)
  if (action.input?.name !== undefined && !explicitName) {
    scope.issue(
      'field.invalid',
      'Field option name must be a non-empty string',
      'input.name'
    )
    return scope.finish()
  }
  if (explicitName && findFieldOptionByName(context.options, explicitName)) {
    return scope.finish()
  }

  const nextOption = createNextFieldOption(
    context.field,
    context.options,
    explicitName ?? createOptionName(context.options)
  )
  const patch = replaceFieldOptions(
    context.field,
    [...context.options, nextOption]
  ) as Partial<Omit<CustomField, 'id'>>

  return scope.finish(toFieldPatch(action.fieldId, patch))
}

const lowerFieldOptionReorder = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.option.reorder' }>
): PlannedActionResult => {
  const context = requireOptionField(scope, action.fieldId)
  if (!context) {
    return scope.finish()
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
    return scope.finish()
  }

  return scope.finish(
    toFieldPatch(
      action.fieldId,
      replaceFieldOptions(context.field, nextOptions) as Partial<Omit<CustomField, 'id'>>
    )
  )
}

const lowerFieldOptionUpdate = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.option.update' }>
): PlannedActionResult => {
  const context = requireOptionField(scope, action.fieldId)
  if (!context) {
    return scope.finish()
  }

  const optionId = trimToUndefined(action.optionId)
  if (!optionId) {
    scope.issue(
      'field.invalid',
      'Field option id must be a non-empty string',
      'optionId'
    )
    return scope.finish()
  }

  const target = context.options.find(option => option.id === optionId)
  if (!target) {
    scope.issue(
      'field.invalid',
      `Unknown field option: ${optionId}`,
      'optionId'
    )
    return scope.finish()
  }

  const nextName = trimToUndefined(action.patch.name)
  if (action.patch.name !== undefined) {
    if (!nextName) {
      scope.issue(
        'field.invalid',
        'Field option name must be a non-empty string',
        'patch.name'
      )
      return scope.finish()
    }

    const conflicting = findFieldOptionByName(context.options, nextName)
    if (conflicting && conflicting.id !== optionId) {
      scope.issue(
        'field.invalid',
        `Duplicate field option name: ${nextName}`,
        'patch.name'
      )
      return scope.finish()
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
    return scope.finish()
  }

  const patch = replaceFieldOptions(
    context.field,
    context.options.map(option => option.id === optionId ? nextOption : option)
  ) as Partial<Omit<CustomField, 'id'>>

  return scope.finish(toFieldPatch(action.fieldId, patch))
}

const lowerFieldOptionRemove = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.option.remove' }>
): PlannedActionResult => {
  const records = scope.reader.records.list()
  const context = requireOptionField(scope, action.fieldId)
  if (!context) {
    return scope.finish()
  }

  const optionId = trimToUndefined(action.optionId)
  if (!optionId) {
    scope.issue(
      'field.invalid',
      'Field option id must be a non-empty string',
      'optionId'
    )
    return scope.finish()
  }
  if (!context.options.some(option => option.id === optionId)) {
    scope.issue(
      'field.invalid',
      `Unknown field option: ${optionId}`,
      'optionId'
    )
    return scope.finish()
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

  const valueOps: DocumentOperation[] = []

  if (context.field.kind === 'select' || context.field.kind === 'status') {
    const clearedRecordIds: RecordId[] = []

    records.forEach(record => {
      if (record.values[context.field.id] === optionId) {
        clearedRecordIds.push(record.id)
      }
    })

    if (clearedRecordIds.length) {
      valueOps.push(toRecordFieldWriteMany({
        recordIds: clearedRecordIds,
        clear: [context.field.id]
      }))
    }
  } else {
    records.forEach(record => {
      const currentValue = record.values[context.field.id]
      if (!Array.isArray(currentValue)) {
        return
      }

      const nextValue = currentValue.filter(value => value !== optionId)
      if (nextValue.length === currentValue.length) {
        return
      }

      valueOps.push(toSingleRecordFieldWrite(
        record.id,
        context.field.id,
        nextValue.length
          ? nextValue
          : undefined
      ))
    })
  }

  return scope.finish(
    toFieldPatch(action.fieldId, patch),
    ...valueOps
  )
}

const lowerFieldRemove = (
  scope: PlannerScope,
  action: Extract<Action, { type: 'field.remove' }>
): PlannedActionResult => {
  const views = scope.reader.views.list()
  if (!requireCustomField(scope, action.fieldId)) {
    return scope.finish()
  }

  return scope.finish(
    ...buildRemovedFieldViewOps(views, action.fieldId),
    {
      type: 'document.field.remove',
      fieldId: action.fieldId
    }
  )
}

export const planFieldAction = (
  scope: PlannerScope,
  action: Action
): PlannedActionResult => {
  switch (action.type) {
    case 'field.create':
      return lowerFieldCreate(scope, action)
    case 'field.patch':
      return lowerFieldPatch(scope, action)
    case 'field.replace':
      return lowerFieldReplace(scope, action)
    case 'field.convert':
      return lowerFieldConvert(scope, action)
    case 'field.duplicate':
      return lowerFieldDuplicate(scope, action)
    case 'field.option.create':
      return lowerFieldOptionCreate(scope, action)
    case 'field.option.reorder':
      return lowerFieldOptionReorder(scope, action)
    case 'field.option.update':
      return lowerFieldOptionUpdate(scope, action)
    case 'field.option.remove':
      return lowerFieldOptionRemove(scope, action)
    case 'field.remove':
      return lowerFieldRemove(scope, action)
    default:
      throw new Error(`Unsupported field planner action: ${action.type}`)
  }
}
