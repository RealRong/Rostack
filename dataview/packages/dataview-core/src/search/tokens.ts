import type {
  CustomField,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  Search
} from '@dataview/core/contracts'
import {
  document as documentApi
} from '@dataview/core/document'
import {
  field as fieldApi
} from '@dataview/core/field'
import {
  fieldSpec
} from '@dataview/core/field/spec'
import {
  appendTokens,
  joinTokens,
  normalizeTokens,
  SEARCH_TOKEN_SEPARATOR,
  splitJoinedTokens
} from '@dataview/core/shared/searchTokens'

export {
  joinTokens,
  normalizeTokens,
  SEARCH_TOKEN_SEPARATOR
} from '@dataview/core/shared/searchTokens'

const EMPTY_TEXTS = [] as readonly string[]
const EMPTY_FIELDS = [] as readonly CustomField[]

export interface SearchTextContext {
  document?: DataDoc
  fields?: readonly CustomField[]
}

export const isDefaultSearchField = (
  field: CustomField | undefined
): boolean => fieldSpec.index.searchDefaultEnabled(field)

const joinSearchTokenSet = (
  tokens: ReadonlySet<string>
): string | undefined => tokens.size
  ? Array.from(tokens).join(SEARCH_TOKEN_SEPARATOR)
  : undefined

export const splitText = splitJoinedTokens

export const buildFieldText = (
  field: Field | undefined,
  value: unknown
): string | undefined => {
  const tokens = fieldApi.search.tokens(field, value)
  if (!tokens.length) {
    return undefined
  }

  const normalized = new Set<string>()
  appendTokens(normalized, tokens)
  return joinSearchTokenSet(normalized)
}

const buildRecordFieldTextFromField = (
  record: DataRecord,
  fieldId: FieldId,
  field?: Field
): string | undefined => {
  if (!field && fieldId !== 'title') {
    return undefined
  }

  return buildFieldText(
    field,
    documentApi.values.get(record, fieldId)
  )
}

const readContextField = (
  fieldId: FieldId,
  context: SearchTextContext
): Field | undefined => {
  if (fieldId === 'title') {
    return undefined
  }

  if (context.document) {
    return documentApi.fields.get(context.document, fieldId)
  }

  return context.fields?.find(field => field.id === fieldId)
}

const readContextFields = (
  context: SearchTextContext
): readonly CustomField[] => {
  if (context.fields) {
    return context.fields
  }

  if (!context.document) {
    return EMPTY_FIELDS
  }

  const fields: CustomField[] = []

  for (let index = 0; index < context.document.fields.order.length; index += 1) {
    const fieldId = context.document.fields.order[index]!
    const field = documentApi.schema.fields.get(context.document, fieldId)
    if (field && isDefaultSearchField(field)) {
      fields.push(field)
    }
  }

  return fields
}

export const buildRecordFieldText = (
  record: DataRecord,
  fieldId: FieldId,
  context: SearchTextContext
): string | undefined => {
  return buildRecordFieldTextFromField(
    record,
    fieldId,
    readContextField(fieldId, context)
  )
}

const appendRecordDefaultSearchTokens = (
  target: Set<string>,
  record: DataRecord,
  fields: readonly CustomField[]
) => {
  const titleTokens = fieldApi.search.tokens(
    undefined,
    documentApi.values.get(record, 'title')
  )
  if (titleTokens.length) {
    appendTokens(target, titleTokens)
  }

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!
    const tokens = fieldApi.search.tokens(
      field,
      documentApi.values.get(record, field.id)
    )
    if (tokens.length) {
      appendTokens(target, tokens)
    }
  }
}

const buildRecordDefaultTextFromFields = (
  record: DataRecord,
  fields: readonly CustomField[]
): string | undefined => {
  const tokens = new Set<string>()
  appendRecordDefaultSearchTokens(tokens, record, fields)
  return joinSearchTokenSet(tokens)
}

export const buildRecordDefaultText = (
  record: DataRecord,
  context: SearchTextContext
): string | undefined => buildRecordDefaultTextFromFields(record, readContextFields(context))

export const buildRecordTexts = (
  record: DataRecord,
  search: Pick<Search, 'fields'>,
  context: SearchTextContext
): readonly string[] => {
  if (search.fields?.length) {
    const texts: string[] = []

    for (let index = 0; index < search.fields.length; index += 1) {
      const fieldId = search.fields[index]!
      const text = buildRecordFieldText(record, fieldId, context)
      if (text) {
        texts.push(text)
      }
    }

    return texts.length
      ? texts
      : EMPTY_TEXTS
  }

  const text = buildRecordDefaultText(record, context)
  return text ? [text] : EMPTY_TEXTS
}
