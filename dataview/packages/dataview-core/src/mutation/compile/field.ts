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
import { createId, equal, string } from '@shared/core'
import {
  view as viewApi
} from '@dataview/core/view'
import type {
  DocumentReader
} from '../../document/reader'
import { validateField } from '@dataview/core/field/validate'
import {
  createEntityPatch
} from './patch'
import {
  issue,
  reportIssues,
  type DataviewCompileContext,
  type DataviewCompileContext as DataviewCompileInput
} from './base'
import {
  writeViewDisplayInsert,
  writeViewUpdate
} from './viewDiff'

const DEFAULT_OPTION_NAME = 'Option'

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
  input: DataviewCompileContext,
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
  const document = input.document
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
  input.program.field.create(field)
  input.output({ id: field.id })
}

const lowerFieldPatch = (
  intent: Extract<Intent, { type: 'field.patch' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const document = input.document
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
  input.program.field.patch(intent.id, intent.patch)
}

const lowerFieldReplace = (
  intent: Extract<Intent, { type: 'field.replace' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const document = input.document
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

  input.program.field.patch(intent.id, createEntityPatch(current, field))
}

const lowerFieldSetKind = (
  intent: Extract<Intent, { type: 'field.setKind' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
) => {
  const document = input.document
  const views = reader.views.list()
  const field = requireCustomField(input, reader, intent.id, 'id')
  if (!field) {
    return
  }

  const nextField = fieldApi.kind.convert(field, intent.kind)
  const patch = createEntityPatch(field, nextField)
  reportIssues(input, ...validateField(document, input.source, nextField, 'kind'))

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
  input: DataviewCompileInput,
  reader: DocumentReader
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

  reportIssues(input, ...validateField(document, input.source, nextField, 'field'))
  input.program.field.create(nextField)

  records.forEach((record) => {
    if (!Object.prototype.hasOwnProperty.call(record.values, sourceField.id)) {
      return
    }

    input.program.record.value.writeMany({
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

    writeViewDisplayInsert(
      input.program,
      view.id,
      nextFieldId,
      view.display.fields[sourceIndex + 1]
    )
  })

  input.output({
    id: nextField.id
  })
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
  input.program.field.option.insert(intent.field, nextOption)
  input.output({ id: nextOption.id })
}

const lowerFieldOptionMove = (
  intent: Extract<Intent, { type: 'field.option.move' }>,
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
  const currentOption = context.options.find((option) => option.id === optionId)
  if (!currentOption) {
    issue(
      input,
      'field.invalid',
      `Unknown field option: ${optionId}`,
      'option'
    )
    return
  }

  const before = intent.before === optionId
    ? undefined
    : intent.before

  if (context.field.kind === 'status' && intent.category !== undefined) {
    const category = fieldApi.status.category.get(context.field, optionId)
    if (category !== intent.category) {
      input.program.field.option.patch(intent.field, optionId, {
        category: intent.category
      })
    }
  }

  input.program.field.option.move(
    intent.field,
    optionId,
    before === undefined
      ? undefined
      : {
          before
        }
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

  const currentOption = context.options.find((option) => option.id === optionId)
  if (!currentOption) {
    issue(
      input,
      'field.invalid',
      `Unknown field option: ${optionId}`,
      'option'
    )
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

  input.program.field.option.patch(intent.field, optionId, intent.patch)
}

const lowerFieldOptionRemove = (
  intent: Extract<Intent, { type: 'field.option.remove' }>,
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
  reader.records.list().forEach((record) => {
    const nextValue = optionSpec.projectValueWithoutOption({
      field: context.field,
      value: record.values[context.field.id],
      optionId
    })
    if (nextValue.kind === 'keep') {
      return
    }

    input.program.record.value.writeMany({
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

  input.program.field.option.delete(intent.field, optionId)
}

const lowerFieldRemove = (
  intent: Extract<Intent, { type: 'field.remove' }>,
  input: DataviewCompileInput,
  reader: DocumentReader
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

    input.program.record.value.writeMany({
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
