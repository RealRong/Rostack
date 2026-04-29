import type {
  CustomField,
  FieldOption,
  FieldId,
  Intent,
  RecordId,
  View
} from '@dataview/core/types'
import type { DocumentOperation } from '@dataview/core/op'
import {
  field as fieldApi
} from '@dataview/core/field'
import { createId } from '@shared/core'
import {
  view as viewApi
} from '@dataview/core/view'
import { equal, string } from '@shared/core'
import type {
  DocumentReader
} from './compile-read'
import { validateField } from '@dataview/core/field/validate'
import {
  createEntityPatch
} from './compile-patch'
import {
  emitMany,
  issue,
  reportIssues,
  type DataviewCompileInput
} from './compile-base'

const DEFAULT_OPTION_NAME = 'Option'

const emitData = <T>(
  input: DataviewCompileInput,
  data: T,
  ...operations: readonly DocumentOperation[]
): T => {
  emitMany(input, ...operations)
  return data
}

const toViewPatch = (
  current: View,
  next: View
): DocumentOperation => ({
  type: 'view.patch',
  id: current.id,
  patch: createEntityPatch(current, next)
})

const toFieldPatch = (
  id: string,
  patch: Partial<Omit<CustomField, 'id'>>
): DocumentOperation => ({
  type: 'field.patch',
  id,
  patch
})

const toRecordFieldWriteMany = (input: {
  recordIds: readonly RecordId[]
  set?: Partial<Record<FieldId, unknown>>
  clear?: readonly FieldId[]
}): DocumentOperation => ({
  type: 'record.values.writeMany',
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
  views.flatMap((view) => {
    const nextView = viewApi.repair.field.removed(view, fieldId)
    return nextView === view
      ? []
      : [toViewPatch(view, nextView)]
  })
)

const buildConvertedFieldViewOps = (
  views: readonly View[],
  field: CustomField
): DocumentOperation[] => (
  views.flatMap((view) => {
    const nextView = viewApi.repair.field.converted(view, field)
    return nextView === view
      ? []
      : [toViewPatch(view, nextView)]
  })
)

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
  input: DataviewCompileInput,
  reader: DocumentReader,
  fieldId: string,
  path = 'fieldId'
): CustomField | undefined => {
  const field = reader.fields.get(fieldId)
  if (!fieldApi.kind.isCustom(field)) {
    issue(
      input,
      'field.notFound',
      `Unknown field: ${fieldId}`,
      path
    )
    return undefined
  }

  return field
}

const requireOptionField = (
  input: DataviewCompileInput,
  reader: DocumentReader,
  fieldId: string
) => {
  const field = requireCustomField(input, reader, fieldId)
  if (!field) {
    return undefined
  }
  if (!fieldApi.kind.hasOptions(field)) {
    issue(
      input,
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

const applyFieldPatch = (
  field: CustomField,
  patch: Partial<Omit<CustomField, 'id'>>
): CustomField => {
  const base = patch.kind && patch.kind !== field.kind
    ? fieldApi.kind.convert(field, patch.kind)
    : structuredClone(field)

  return {
    ...base,
    ...patch,
    id: field.id
  } as CustomField
}

const lowerFieldCreate = (
  intent: Extract<Intent, { type: 'field.create' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const document = reader.document()
  const explicitFieldId = string.trimToUndefined(intent.input.id)

  if (intent.input.id !== undefined && !explicitFieldId) {
    issue(
      input,
      'field.invalid',
      'Field id must be a non-empty string',
      'input.id'
    )
  }
  if (explicitFieldId && reader.fields.has(explicitFieldId)) {
    issue(
      input,
      'field.invalid',
      `Field already exists: ${explicitFieldId}`,
      'input.id'
    )
  }
  if ((intent.input.id !== undefined && !explicitFieldId) || (explicitFieldId && reader.fields.has(explicitFieldId))) {
    return
  }

  const field = fieldApi.create.default({
    id: explicitFieldId || createId('field'),
    name: intent.input.name,
    kind: intent.input.kind ?? 'text',
    meta: intent.input.meta
  })

  reportIssues(input, ...validateField(document, input.source, field, 'input'))
  return emitData(input, { id: field.id }, {
    type: 'field.create',
    value: field
  })
}

const lowerFieldPatch = (
  intent: Extract<Intent, { type: 'field.patch' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const document = reader.document()
  const field = requireCustomField(input, reader, intent.id, 'id')
  if (!field) {
    return
  }

  if (!Object.keys(intent.patch).length) {
    issue(
      input,
      'field.invalid',
      'field.patch patch cannot be empty',
      'patch'
    )
    return
  }

  const nextField = applyFieldPatch(field, intent.patch)
  reportIssues(input, ...validateField(document, input.source, nextField, 'patch'))
  input.emit(toFieldPatch(intent.id, intent.patch))
}

const lowerFieldReplace = (
  intent: Extract<Intent, { type: 'field.replace' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const document = reader.document()
  if (!requireCustomField(input, reader, intent.id, 'id')) {
    return
  }

  const field = {
    ...structuredClone(intent.field),
    id: intent.id
  } satisfies CustomField

  reportIssues(input, ...validateField(document, input.source, field, 'field'))
  const current = reader.fields.get(intent.id)
  if (!current || !fieldApi.kind.isCustom(current)) {
    return
  }

  input.emit({
    type: 'field.patch',
    id: intent.id,
    patch: createEntityPatch(current, field)
  })
}

const lowerFieldSetKind = (
  intent: Extract<Intent, { type: 'field.setKind' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const document = reader.document()
  const views = reader.views.list()
  const field = requireCustomField(input, reader, intent.id, 'id')
  if (!field) {
    return
  }

  const nextField = fieldApi.kind.convert(field, intent.kind)
  const patch = createEntityPatch(field, nextField)
  reportIssues(input, ...validateField(document, input.source, nextField, 'kind'))

  emitMany(
    input,
    toFieldPatch(intent.id, patch),
    ...buildConvertedFieldViewOps(views, nextField)
  )
}

const lowerFieldDuplicate = (
  intent: Extract<Intent, { type: 'field.duplicate' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const document = reader.document()
  const views = reader.views.list()
  const records = reader.records.list()
  const sourceField = requireCustomField(input, reader, intent.id, 'id')
  if (!sourceField) {
    return
  }

  const nextFieldId = createId('field')
  const nextField = {
    ...structuredClone(sourceField),
    id: nextFieldId,
    name: fieldApi.schema.name.unique(
      `${sourceField.name} Copy`,
      reader.fields.list().filter(fieldApi.kind.isCustom)
    )
  } satisfies CustomField

  reportIssues(input, ...validateField(document, input.source, nextField, 'field'))

  const recordOps: DocumentOperation[] = records.flatMap((record) => (
    Object.prototype.hasOwnProperty.call(record.values, sourceField.id)
      ? [toSingleRecordFieldWrite(
          record.id,
          nextFieldId,
          structuredClone(record.values[sourceField.id])
        )]
      : []
  ))

  const viewOps: DocumentOperation[] = views.flatMap((view) => {
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

      return [toViewPatch(view, {
        ...view,
        display: {
          fields: currentFieldIds.filter((fieldId) => fieldId !== nextFieldId)
        }
      })]
    }

    const withoutCreated = currentFieldIds.filter((fieldId) => fieldId !== nextFieldId)
    const nextFieldIds = [...withoutCreated]
    nextFieldIds.splice(Math.min(sourceIndex + 1, nextFieldIds.length), 0, nextFieldId)
    return [toViewPatch(view, {
      ...view,
      display: {
        fields: nextFieldIds
      }
    })]
  })

  return emitData(
    input,
    {
      id: nextField.id
    },
    {
      type: 'field.create',
      value: nextField
    },
    ...recordOps,
    ...viewOps
  )
}

const lowerFieldOptionCreate = (
  intent: Extract<Intent, { type: 'field.option.create' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const context = requireOptionField(input, reader, intent.field)
  if (!context) {
    return
  }

  const explicitName = string.trimToUndefined(intent.name)
  if (intent.name !== undefined && !explicitName) {
    issue(
      input,
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
  )

  return emitData(input, { id: nextOption.id }, toFieldPatch(intent.field, patch as Partial<Omit<CustomField, 'id'>>))
}

const lowerFieldOptionSetOrder = (
  intent: Extract<Intent, { type: 'field.option.setOrder' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const context = requireOptionField(input, reader, intent.field)
  if (!context) {
    return
  }

  const optionMap = new Map(context.options.map((option: FieldOption) => [option.id, option] as const))
  const seen = new Set<string>()
  const ordered = intent.order
    .map((optionId) => {
      if (seen.has(optionId)) {
        return undefined
      }
      seen.add(optionId)
      return optionMap.get(optionId)
    })
    .filter((option): option is typeof context.options[number] => Boolean(option))

  const nextOptions = [...ordered, ...context.options.filter((option) => !seen.has(option.id))]
  if (
    nextOptions.length === context.options.length
    && nextOptions.every((option, optionIndex) => option.id === context.options[optionIndex]?.id)
  ) {
    return
  }

  input.emit(
    toFieldPatch(
      intent.field,
      fieldApi.option.write.replace(context.field, nextOptions) as Partial<Omit<CustomField, 'id'>>
    )
  )
}

const lowerFieldOptionPatch = (
  intent: Extract<Intent, { type: 'field.option.patch' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const context = requireOptionField(input, reader, intent.field)
  if (!context) {
    return
  }

  const optionId = string.trimToUndefined(intent.option)
  if (!optionId) {
    issue(
      input,
      'field.invalid',
      'Field option id must be a non-empty string',
      'option'
    )
    return
  }

  const target = context.options.find((option) => option.id === optionId)
  if (!target) {
    issue(
      input,
      'field.invalid',
      `Unknown field option: ${optionId}`,
      'option'
    )
    return
  }

  const nextName = string.trimToUndefined(intent.patch.name)
  if (intent.patch.name !== undefined) {
    if (!nextName) {
      issue(
        input,
        'field.invalid',
        'Field option name must be a non-empty string',
        'patch.name'
      )
      return
    }

    const conflicting = fieldApi.option.read.findByName(context.options, nextName)
    if (conflicting && conflicting.id !== optionId) {
      issue(
        input,
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
    context.options.map((option) => option.id === optionId ? nextOption : option)
  )

  input.emit(toFieldPatch(intent.field, patch as Partial<Omit<CustomField, 'id'>>))
}

const lowerFieldOptionRemove = (
  intent: Extract<Intent, { type: 'field.option.remove' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const records = reader.records.list()
  const context = requireOptionField(input, reader, intent.field)
  if (!context) {
    return
  }

  const optionId = string.trimToUndefined(intent.option)
  if (!optionId) {
    issue(
      input,
      'field.invalid',
      'Field option id must be a non-empty string',
      'option'
    )
    return
  }
  if (!context.options.some((option) => option.id === optionId)) {
    issue(
      input,
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

  records.forEach((record) => {
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

  emitMany(
    input,
    toFieldPatch(intent.field, patch),
    ...valueOps
  )
}

const lowerFieldRemove = (
  intent: Extract<Intent, { type: 'field.remove' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const views = reader.views.list()
  if (!requireCustomField(input, reader, intent.id, 'id')) {
    return
  }

  emitMany(
    input,
    ...buildRemovedFieldViewOps(views, intent.id),
    {
      type: 'field.remove',
      id: intent.id
    }
  )
}

export const compileFieldIntent = (
  intent: Intent,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  switch (intent.type) {
    case 'field.create':
      return lowerFieldCreate(intent, input, reader)
    case 'field.patch':
      return lowerFieldPatch(intent, input, reader)
    case 'field.replace':
      return lowerFieldReplace(intent, input, reader)
    case 'field.setKind':
      return lowerFieldSetKind(intent, input, reader)
    case 'field.duplicate':
      return lowerFieldDuplicate(intent, input, reader)
    case 'field.option.create':
      return lowerFieldOptionCreate(intent, input, reader)
    case 'field.option.setOrder':
      return lowerFieldOptionSetOrder(intent, input, reader)
    case 'field.option.patch':
      return lowerFieldOptionPatch(intent, input, reader)
    case 'field.option.remove':
      return lowerFieldOptionRemove(intent, input, reader)
    case 'field.remove':
      return lowerFieldRemove(intent, input, reader)
    default:
      throw new Error(`Unsupported field intent: ${intent.type}`)
  }
}
