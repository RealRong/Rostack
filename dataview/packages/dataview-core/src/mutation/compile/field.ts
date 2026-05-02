import type {
  CustomField,
  FieldOption,
  FieldId,
  Intent
} from '@dataview/core/types'
import { TITLE_FIELD_ID } from '@dataview/core/types'
import {
  field as fieldApi
} from '@dataview/core/field'
import { createId, equal, json, string } from '@shared/core'
import {
  view as viewApi
} from '@dataview/core/view'
import type {
  DataviewCompileContext
} from './contracts'
import {
  writeViewUpdate
} from './viewDiff'

const DEFAULT_OPTION_NAME = 'Option'
type FieldIntentType = Extract<Intent['type'], `field.${string}`>
type DataviewFieldIntentHandlers = {
  [K in FieldIntentType]: (
    input: DataviewCompileContext<Extract<Intent, { type: K }>>
  ) => void
}

const toBeforeAnchor = (
  before?: string
) => before === undefined
  ? undefined
  : {
      kind: 'before' as const,
      itemId: before
    }

const createOptionName = (
  options: readonly FieldOption[]
) => {
  let nextName = DEFAULT_OPTION_NAME
  let index = 1
  while (options.some((option) => option.name === nextName)) {
    index += 1
    nextName = `${DEFAULT_OPTION_NAME} ${index}`
  }
  return nextName
}

const requireCustomField = (
  input: DataviewCompileContext,
  fieldId: string,
  path = 'fieldId'
): CustomField | undefined => {
  const field = input.expect!.field(fieldId, path)
  if (!fieldApi.kind.isCustom(field)) {
    input.issue({
      source: input.source,
      code: 'field.notFound',
      message: `Unknown field: ${fieldId}`,
      path,
      severity: 'error'
    })
    return undefined
  }

  return field
}

const requireOptionField = (
  input: DataviewCompileContext,
  fieldId: string
) => {
  const field = requireCustomField(input, fieldId)
  if (!field) {
    return undefined
  }
  if (!fieldApi.kind.hasOptions(field)) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: 'Field does not support options',
      path: 'fieldId',
      severity: 'error'
    })
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
  input: DataviewCompileContext<Extract<Intent, { type: 'field.create' }>>
) => {
  const { intent } = input
  const { reader } = input
  const explicitFieldId = string.trimToUndefined(intent.input.id)

  if (intent.input.id !== undefined && !explicitFieldId) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: 'Field id must be a non-empty string',
      path: 'input.id',
      severity: 'error'
    })
  }
  if (explicitFieldId && reader.fields.has(explicitFieldId)) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: `Field already exists: ${explicitFieldId}`,
      path: 'input.id',
      severity: 'error'
    })
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

  input.program.field.create(field)
  input.output({ id: field.id })
}

const lowerFieldPatch = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.patch' }>>
) => {
  const { intent } = input
  const field = requireCustomField(input, intent.id, 'id')
  if (!field) {
    return
  }

  if (!Object.keys(intent.patch).length) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: 'field.patch patch cannot be empty',
      path: 'patch',
      severity: 'error'
    })
    return
  }

  const nextField = applyFieldPatch(field, intent.patch)
  if (equal.sameJsonValue(field, nextField)) {
    return
  }
  input.program.field.patch(intent.id, intent.patch)
}

const lowerFieldReplace = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.replace' }>>
) => {
  const { intent } = input
  if (!requireCustomField(input, intent.id, 'id')) {
    return
  }

  const field = {
    ...structuredClone(intent.field),
    id: intent.id
  } satisfies CustomField

  const current = input.reader.fields.get(intent.id)
  if (!current || !fieldApi.kind.isCustom(current)) {
    return
  }

  input.program.field.patch(intent.id, json.diff(current, field))
}

const lowerFieldSetKind = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.setKind' }>>
) => {
  const { intent } = input
  const { reader } = input
  const views = reader.views.list()
  const field = requireCustomField(input, intent.id, 'id')
  if (!field) {
    return
  }

  const nextField = fieldApi.kind.convert(field, intent.kind)
  const patch = json.diff(field, nextField)
  if (!Object.keys(patch).length) {
    return
  }

  input.program.field.patch(intent.id, patch)
  views.forEach((view) => {
    const nextView = viewApi.repair.field.converted(view, nextField)
    if (nextView !== view) {
      writeViewUpdate(input.program, view, nextView)
    }
  })
}

const lowerFieldDuplicate = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.duplicate' }>>
) => {
  const { intent } = input
  const { reader } = input
  const views = reader.views.list()
  const records = reader.records.list()
  const sourceField = requireCustomField(input, intent.id, 'id')
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

  input.program.field.create(nextField)

  records.forEach((record) => {
    if (!Object.prototype.hasOwnProperty.call(record.values, sourceField.id)) {
      return
    }

    input.program.record.writeValuesMany({
      recordIds: [record.id],
      set: {
        [nextFieldId]: structuredClone(record.values[sourceField.id])
      }
    })
  })

  views.forEach((view) => {
    const viewFieldIds = viewApi.fields.read.ids(view)
    if (view.type !== 'table' || viewFieldIds.includes(nextFieldId)) {
      return
    }

    const sourceIndex = viewFieldIds.indexOf(sourceField.id)
    if (sourceIndex === -1) {
      return
    }

    input.program.viewFields(view.id).insert(
      nextFieldId,
      viewFieldIds[sourceIndex + 1] === undefined
        ? undefined
        : {
            kind: 'before',
            itemId: viewFieldIds[sourceIndex + 1]
          }
    )
  })

  input.output({
    id: nextField.id
  })
}

const lowerFieldOptionCreate = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.option.create' }>>
) => {
  const { intent } = input
  const context = requireOptionField(input, intent.field)
  if (!context) {
    return
  }

  const explicitName = string.trimToUndefined(intent.name)
  if (intent.name !== undefined && !explicitName) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: 'Field option name must be a non-empty string',
      path: 'name',
      severity: 'error'
    })
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
  input.program.fieldOptions(intent.field).insert(nextOption)
  input.output({ id: nextOption.id })
}

const lowerFieldOptionMove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.option.move' }>>
) => {
  const { intent } = input
  const context = requireOptionField(input, intent.field)
  if (!context) {
    return
  }

  const optionId = string.trimToUndefined(intent.option)
  if (!optionId) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: 'Field option id must be a non-empty string',
      path: 'option',
      severity: 'error'
    })
    return
  }
  const currentOption = context.options.find((option) => option.id === optionId)
  if (!currentOption) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: `Unknown field option: ${optionId}`,
      path: 'option',
      severity: 'error'
    })
    return
  }

  const before = intent.before === optionId
    ? undefined
    : intent.before

  if (context.field.kind === 'status' && intent.category !== undefined) {
    const category = fieldApi.status.category.get(context.field, optionId)
    if (category !== intent.category) {
      input.program.fieldOptions(intent.field).patch(optionId, {
        category: intent.category
      })
    }
  }

  input.program.fieldOptions(intent.field).move(
    optionId,
    toBeforeAnchor(before)
  )
}

const lowerFieldOptionPatch = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.option.patch' }>>
) => {
  const { intent } = input
  const context = requireOptionField(input, intent.field)
  if (!context) {
    return
  }

  const optionId = string.trimToUndefined(intent.option)
  if (!optionId) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: 'Field option id must be a non-empty string',
      path: 'option',
      severity: 'error'
    })
    return
  }

  const currentOption = context.options.find((option) => option.id === optionId)
  if (!currentOption) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: `Unknown field option: ${optionId}`,
      path: 'option',
      severity: 'error'
    })
    return
  }

  const nextOption = {
    ...structuredClone(currentOption),
    ...intent.patch,
    id: optionId
  } satisfies FieldOption
  if (equal.sameJsonValue(currentOption, nextOption)) {
    return
  }

  input.program.fieldOptions(intent.field).patch(optionId, intent.patch)
}

const lowerFieldOptionRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.option.remove' }>>
) => {
  const { intent } = input
  const { reader } = input
  const context = requireOptionField(input, intent.field)
  if (!context) {
    return
  }

  const optionId = string.trimToUndefined(intent.option)
  if (!optionId) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: 'Field option id must be a non-empty string',
      path: 'option',
      severity: 'error'
    })
    return
  }
  if (!context.options.some((option) => option.id === optionId)) {
    input.issue({
      source: input.source,
      code: 'field.invalid',
      message: `Unknown field option: ${optionId}`,
      path: 'option',
      severity: 'error'
    })
    return
  }

  const optionSpec = fieldApi.option.spec.get(context.field)
  reader.records.list().forEach((record) => {
    const nextValue = optionSpec.projectValueWithoutOption({
      field: context.field,
      value: record.values[context.field.id],
      optionId
    })
    if (nextValue.kind === 'keep') {
      return
    }

    input.program.record.writeValuesMany({
      recordIds: [record.id],
      ...(nextValue.kind === 'clear'
        ? {
            clear: [context.field.id]
          }
        : {
            set: {
              [context.field.id]: nextValue.value
            }
          })
    })
  })

  if (context.field.kind === 'status' && context.field.defaultOptionId === optionId) {
    input.program.field.patch(context.field.id, {
      defaultOptionId: null
    })
  }

  input.program.fieldOptions(intent.field).delete(optionId)
}

const lowerFieldRemove = (
  input: DataviewCompileContext<Extract<Intent, { type: 'field.remove' }>>
) => {
  const { intent } = input
  const { reader } = input
  const views = reader.views.list()
  const field = requireCustomField(input, intent.id, 'id')
  if (!field) {
    return
  }

  reader.records.list().forEach((record) => {
    if (!Object.prototype.hasOwnProperty.call(record.values, field.id)) {
      return
    }

    input.program.record.writeValuesMany({
      recordIds: [record.id],
      clear: [field.id]
    })
  })

  views.forEach((view) => {
    const nextView = viewApi.repair.field.removed(view, intent.id)
    if (nextView !== view) {
      writeViewUpdate(input.program, view, nextView)
    }
  })

  input.program.field.delete(intent.id)
}

export const dataviewFieldIntentHandlers: DataviewFieldIntentHandlers = {
  'field.create': lowerFieldCreate,
  'field.patch': lowerFieldPatch,
  'field.replace': lowerFieldReplace,
  'field.setKind': lowerFieldSetKind,
  'field.duplicate': lowerFieldDuplicate,
  'field.option.create': lowerFieldOptionCreate,
  'field.option.move': lowerFieldOptionMove,
  'field.option.patch': lowerFieldOptionPatch,
  'field.option.remove': lowerFieldOptionRemove,
  'field.remove': lowerFieldRemove
}
