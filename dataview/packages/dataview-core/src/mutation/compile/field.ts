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
import { validateField } from '@dataview/core/field/validate'
import type {
  DataviewCompileReader
} from './reader'
import type {
  DataviewCompileContext
} from './contracts'
import {
  writeViewUpdate
} from './viewDiff'

const DEFAULT_OPTION_NAME = 'Option'

const toBeforeAnchor = (
  before?: string
) => before === undefined
  ? undefined
  : {
      kind: 'before' as const,
      itemId: before
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
  input: DataviewCompileContext,
  reader: DataviewCompileReader,
  fieldId: string,
  path = 'fieldId'
): CustomField | undefined => {
  const field = reader.fields.require(fieldId, path)
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
  reader: DataviewCompileReader,
  fieldId: string
) => {
  const field = requireCustomField(input, reader, fieldId)
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
  intent: Extract<Intent, { type: 'field.create' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const document = input.document
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

  input.issue(...validateField(document, input.source, field, 'input'))
  input.program.field.create(field)
  input.output({ id: field.id })
}

const lowerFieldPatch = (
  intent: Extract<Intent, { type: 'field.patch' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const document = input.document
  const field = requireCustomField(input, reader, intent.id, 'id')
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
  input.issue(...validateField(document, input.source, nextField, 'patch'))
  input.program.field.patch(intent.id, intent.patch)
}

const lowerFieldReplace = (
  intent: Extract<Intent, { type: 'field.replace' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const document = input.document
  if (!requireCustomField(input, reader, intent.id, 'id')) {
    return
  }

  const field = {
    ...structuredClone(intent.field),
    id: intent.id
  } satisfies CustomField

  input.issue(...validateField(document, input.source, field, 'field'))
  const current = reader.fields.get(intent.id)
  if (!current || !fieldApi.kind.isCustom(current)) {
    return
  }

  input.program.field.patch(intent.id, json.diff(current, field))
}

const lowerFieldSetKind = (
  intent: Extract<Intent, { type: 'field.setKind' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const document = input.document
  const views = reader.views.list()
  const field = requireCustomField(input, reader, intent.id, 'id')
  if (!field) {
    return
  }

  const nextField = fieldApi.kind.convert(field, intent.kind)
  const patch = json.diff(field, nextField)
  input.issue(...validateField(document, input.source, nextField, 'kind'))

  input.program.field.patch(intent.id, patch)
  views.forEach((view) => {
    const nextView = viewApi.repair.field.converted(view, nextField)
    if (nextView !== view) {
      writeViewUpdate(input.program, view, nextView)
    }
  })
}

const lowerFieldDuplicate = (
  intent: Extract<Intent, { type: 'field.duplicate' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const document = input.document
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

  input.issue(...validateField(document, input.source, nextField, 'field'))
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
    if (view.type !== 'table' || view.display.fields.includes(nextFieldId)) {
      return
    }

    const sourceIndex = view.display.fields.indexOf(sourceField.id)
    if (sourceIndex === -1) {
      return
    }

    input.program.viewDisplay(view.id).insert(
      nextFieldId,
      view.display.fields[sourceIndex + 1] === undefined
        ? undefined
        : {
            kind: 'before',
            itemId: view.display.fields[sourceIndex + 1]
          }
    )
  })

  input.output({
    id: nextField.id
  })
}

const lowerFieldOptionCreate = (
  intent: Extract<Intent, { type: 'field.option.create' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const context = requireOptionField(input, reader, intent.field)
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
  intent: Extract<Intent, { type: 'field.option.move' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const context = requireOptionField(input, reader, intent.field)
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
  intent: Extract<Intent, { type: 'field.option.patch' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const context = requireOptionField(input, reader, intent.field)
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
  intent: Extract<Intent, { type: 'field.option.remove' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const context = requireOptionField(input, reader, intent.field)
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
  intent: Extract<Intent, { type: 'field.remove' }>,
  input: DataviewCompileContext,
  reader: DataviewCompileReader
) => {
  const views = reader.views.list()
  const field = requireCustomField(input, reader, intent.id, 'id')
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

export const compileFieldIntent = (
  input: DataviewCompileContext
) => {
  const { intent, reader } = input
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
    case 'field.option.move':
      return lowerFieldOptionMove(intent, input, reader)
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
