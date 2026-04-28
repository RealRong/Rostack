import type {
  CustomField,
  FieldOption,
  FieldId,
  Intent,
  RecordId,
  View
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/types/operations'
import {
  field as fieldApi
} from '@dataview/core/field'
import { createId } from '@shared/core'
import {
  view as viewApi
} from '@dataview/core/view'
import { equal, string } from '@shared/core'
import { validateField } from '@dataview/core/operations/internal/validateField'
import type {
  CompileScope
} from './scope'

const DEFAULT_OPTION_NAME = 'Option'

const emitOps = (
  scope: CompileScope,
  ...operations: readonly DocumentOperation[]
) => {
  scope.emitMany(...operations)
}

const emitData = <T>(
  scope: CompileScope,
  data: T,
  ...operations: readonly DocumentOperation[]
): T => {
  emitOps(scope, ...operations)
  return data
}

const toViewPut = (
  view: View
): DocumentOperation => ({
  type: 'document.view.put',
  view
})

const toFieldPatch = (
  id: string,
  patch: Partial<Omit<CustomField, 'id'>>
): DocumentOperation => ({
  type: 'document.field.patch',
  id,
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
      const nextView = viewApi.repair.field.removed(view, fieldId)
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
      const nextView = viewApi.repair.field.converted(view, field)
      return nextView === view
        ? []
        : [toViewPut(nextView)]
    })
)

const createFieldConvertPatch = (
  field: CustomField,
  kind: CustomField['kind']
): Partial<Omit<CustomField, 'id'>> => {
  const next = fieldApi.kind.convert(field, kind)
  const { id: _id, ...patch } = next
  return patch
}

const createOptionName = (
  options: Extract<CustomField, { kind: 'select' | 'multiSelect' | 'status' }>['options']
) => {
  let nextName = DEFAULT_OPTION_NAME
  let index = 1
  while (fieldApi.option.read.findByName(options, nextName)) {
    index += 1
    nextName = `${DEFAULT_OPTION_NAME} ${index}`
  }
  return nextName
}

const requireCustomField = (
  scope: CompileScope,
  fieldId: string,
  path = 'fieldId'
): CustomField | undefined => {
  const field = scope.reader.fields.get(fieldId)
  if (!fieldApi.kind.isCustom(field)) {
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
  scope: CompileScope,
  fieldId: string
) => {
  const field = requireCustomField(scope, fieldId)
  if (!field) {
    return undefined
  }
  if (!fieldApi.kind.hasOptions(field)) {
    scope.issue(
      'field.invalid',
      'Field does not support options',
      'fieldId'
    )
    return undefined
  }

  return {
    field,
    options: fieldApi.option.read.list(field)
  }
}

const lowerFieldCreate = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.create' }>
) => {
  const document = scope.reader.document()
  const explicitFieldId = string.trimToUndefined(intent.input.id)

  if (intent.input.id !== undefined && !explicitFieldId) {
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
  if ((intent.input.id !== undefined && !explicitFieldId) || (explicitFieldId && scope.reader.fields.has(explicitFieldId))) {
    return
  }

  const field = fieldApi.create.default({
    id: explicitFieldId || createId('field'),
    name: intent.input.name,
    kind: intent.input.kind ?? 'text',
    meta: intent.input.meta
  })

  scope.report(...validateField(document, scope.source, field, 'input'))
  return emitData(scope, { id: field.id }, {
    type: 'document.field.put',
    field
  })
}

const lowerFieldPatch = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.patch' }>
) => {
  const document = scope.reader.document()
  const views = scope.reader.views.list()
  const field = requireCustomField(scope, intent.id, 'id')
  if (!field) {
    return
  }

  if (!Object.keys(intent.patch).length) {
    scope.issue(
      'field.invalid',
      'field.patch patch cannot be empty',
      'patch'
    )
    return
  }

  const nextField = {
    ...field,
    ...(intent.patch as Partial<CustomField>)
  } as CustomField
  scope.report(...validateField(document, scope.source, nextField, 'patch'))

  scope.emit(toFieldPatch(intent.id, intent.patch))
}

const lowerFieldReplace = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.replace' }>
)=> {
  const document = scope.reader.document()
  if (!requireCustomField(scope, intent.id, 'id')) {
    return
  }

  const field = {
    ...structuredClone(intent.field),
    id: intent.id
  } satisfies CustomField

  scope.report(...validateField(document, scope.source, field, 'field'))
  scope.emit({
    type: 'document.field.put',
    field
  })
}

const lowerFieldSetKind = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.setKind' }>
)=> {
  const document = scope.reader.document()
  const views = scope.reader.views.list()
  const field = requireCustomField(scope, intent.id, 'id')
  if (!field) {
    return
  }

  const patch = createFieldConvertPatch(field, intent.kind)
  const nextField = {
    ...field,
    ...patch
  } as CustomField
  scope.report(...validateField(document, scope.source, nextField, 'kind'))

  emitOps(
    scope,
    toFieldPatch(intent.id, patch),
    ...buildConvertedFieldViewOps(views, nextField)
  )
}

const lowerFieldDuplicate = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.duplicate' }>
)=> {
  const document = scope.reader.document()
  const views = scope.reader.views.list()
  const records = scope.reader.records.list()
  const sourceField = requireCustomField(scope, intent.id, 'id')
  if (!sourceField) {
    return
  }

  const nextFieldId = createId('field')
  const nextField: CustomField = {
    ...structuredClone(sourceField),
    id: nextFieldId,
    name: fieldApi.schema.name.unique(
      `${sourceField.name} Copy`,
      scope.reader.fields.list().filter(fieldApi.kind.isCustom)
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

  return emitData(
    scope,
    {
      id: nextField.id
    },
    {
      type: 'document.field.put',
      field: nextField
    },
    ...recordOps,
    ...viewOps
  )
}

const lowerFieldOptionCreate = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.option.create' }>
)=> {
  const context = requireOptionField(scope, intent.field)
  if (!context) {
    return
  }

  const explicitName = string.trimToUndefined(intent.name)
  if (intent.name !== undefined && !explicitName) {
    scope.issue(
      'field.invalid',
      'Field option name must be a non-empty string',
      'name'
    )
    return
  }
  if (explicitName && fieldApi.option.read.findByName(context.options, explicitName)) {
    return
  }

  const nextOption = fieldApi.option.spec.get(context.field).createOption({
    field: context.field,
    options: context.options,
    name: explicitName ?? createOptionName(context.options)
  })
  const patch = fieldApi.option.write.replace(
    context.field,
    [...context.options, nextOption]
  ) as Partial<Omit<CustomField, 'id'>>

  return emitData(scope, { id: nextOption.id }, toFieldPatch(intent.field, patch))
}

const lowerFieldOptionSetOrder = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.option.setOrder' }>
)=> {
  const context = requireOptionField(scope, intent.field)
  if (!context) {
    return
  }

  const optionMap = new Map(context.options.map((option: FieldOption) => [option.id, option] as const))
  const seen = new Set<string>()
  const ordered = intent.order
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
    return
  }

  scope.emit(
    toFieldPatch(
      intent.field,
      fieldApi.option.write.replace(context.field, nextOptions) as Partial<Omit<CustomField, 'id'>>
    )
  )
}

const lowerFieldOptionPatch = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.option.patch' }>
)=> {
  const context = requireOptionField(scope, intent.field)
  if (!context) {
    return
  }

  const optionId = string.trimToUndefined(intent.option)
  if (!optionId) {
    scope.issue(
      'field.invalid',
      'Field option id must be a non-empty string',
      'option'
    )
    return
  }

  const target = context.options.find(option => option.id === optionId)
  if (!target) {
    scope.issue(
      'field.invalid',
      `Unknown field option: ${optionId}`,
      'option'
    )
    return
  }

  const nextName = string.trimToUndefined(intent.patch.name)
  if (intent.patch.name !== undefined) {
    if (!nextName) {
      scope.issue(
        'field.invalid',
        'Field option name must be a non-empty string',
        'patch.name'
      )
      return
    }

    const conflicting = fieldApi.option.read.findByName(context.options, nextName)
    if (conflicting && conflicting.id !== optionId) {
      scope.issue(
        'field.invalid',
        `Duplicate field option name: ${nextName}`,
        'patch.name'
      )
      return
    }
  }

  const nextColor = intent.patch.color === undefined
    ? undefined
    : string.trimToUndefined(intent.patch.color) ?? null
  const nextOption = fieldApi.option.spec.get(context.field).updateOption({
    field: context.field,
    option: target,
    patch: {
      ...(nextName !== undefined
        ? { name: nextName }
        : {}),
      ...(nextColor !== undefined
        ? { color: nextColor }
        : {}),
      ...(intent.patch.category !== undefined
        ? { category: intent.patch.category }
        : {})
    }
  })

  if (equal.sameJsonValue(nextOption, target)) {
    return
  }

  const patch = fieldApi.option.write.replace(
    context.field,
    context.options.map(option => option.id === optionId ? nextOption : option)
  ) as Partial<Omit<CustomField, 'id'>>

  scope.emit(toFieldPatch(intent.field, patch))
}

const lowerFieldOptionRemove = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.option.remove' }>
)=> {
  const records = scope.reader.records.list()
  const context = requireOptionField(scope, intent.field)
  if (!context) {
    return
  }

  const optionId = string.trimToUndefined(intent.option)
  if (!optionId) {
    scope.issue(
      'field.invalid',
      'Field option id must be a non-empty string',
      'option'
    )
    return
  }
  if (!context.options.some(option => option.id === optionId)) {
    scope.issue(
      'field.invalid',
      `Unknown field option: ${optionId}`,
      'option'
    )
    return
  }

  const optionSpec = fieldApi.option.spec.get(context.field)
  const patch = optionSpec.patchForRemove({
    field: context.field,
    options: context.options,
    optionId
  })

  const valueOps: DocumentOperation[] = []
  const clearedRecordIds: RecordId[] = []

  records.forEach(record => {
    const nextValue = optionSpec.projectValueWithoutOption({
      field: context.field,
      value: record.values[context.field.id],
      optionId
    })
    if (nextValue.kind === 'keep') {
      return
    }
    if (nextValue.kind === 'clear') {
      clearedRecordIds.push(record.id)
      return
    }

    valueOps.push(toSingleRecordFieldWrite(
      record.id,
      context.field.id,
      nextValue.value
    ))
  })

  if (clearedRecordIds.length) {
    valueOps.push(toRecordFieldWriteMany({
      recordIds: clearedRecordIds,
      clear: [context.field.id]
    }))
  }

  emitOps(
    scope,
    toFieldPatch(intent.field, patch),
    ...valueOps
  )
}

const lowerFieldRemove = (
  scope: CompileScope,
  intent: Extract<Intent, { type: 'field.remove' }>
)=> {
  const views = scope.reader.views.list()
  if (!requireCustomField(scope, intent.id, 'id')) {
    return
  }

  emitOps(
    scope,
    ...buildRemovedFieldViewOps(views, intent.id),
    {
      type: 'document.field.remove',
      id: intent.id
    }
  )
}

export const compileFieldIntent = (
  intent: Intent,
  scope: CompileScope
) => {
  switch (intent.type) {
    case 'field.create':
      return lowerFieldCreate(scope, intent)
    case 'field.patch':
      return lowerFieldPatch(scope, intent)
    case 'field.replace':
      return lowerFieldReplace(scope, intent)
    case 'field.setKind':
      return lowerFieldSetKind(scope, intent)
    case 'field.duplicate':
      return lowerFieldDuplicate(scope, intent)
    case 'field.option.create':
      return lowerFieldOptionCreate(scope, intent)
    case 'field.option.setOrder':
      return lowerFieldOptionSetOrder(scope, intent)
    case 'field.option.patch':
      return lowerFieldOptionPatch(scope, intent)
    case 'field.option.remove':
      return lowerFieldOptionRemove(scope, intent)
    case 'field.remove':
      return lowerFieldRemove(scope, intent)
    default:
      throw new Error(`Unsupported field intent: ${intent.type}`)
  }
}
