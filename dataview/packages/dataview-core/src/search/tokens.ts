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
  readFieldSpec
} from '@dataview/core/field/spec'
import {
  trimLowercase
} from '@shared/core'

const EMPTY_TEXTS = [] as readonly string[]

export const SEARCH_TOKEN_SEPARATOR = '\u0000'

export const isDefaultSearchField = (
  field: CustomField | undefined
): boolean => readFieldSpec(field)?.index.searchDefaultEnabled === true

const appendNormalizedSearchTokens = (
  target: Set<string>,
  values: readonly string[]
) => {
  for (let index = 0; index < values.length; index += 1) {
    const token = trimLowercase(values[index]!)
    if (token) {
      target.add(token)
    }
  }
}

const joinSearchTokenSet = (
  tokens: ReadonlySet<string>
): string | undefined => tokens.size
  ? Array.from(tokens).join(SEARCH_TOKEN_SEPARATOR)
  : undefined

export const normalizeSearchTokens = (
  values: readonly string[]
): readonly string[] => {
  if (!values.length) {
    return EMPTY_TEXTS
  }

  const tokens = new Set<string>()
  appendNormalizedSearchTokens(tokens, values)
  return tokens.size
    ? Array.from(tokens)
    : EMPTY_TEXTS
}

export const joinSearchTokens = (
  values: readonly string[]
): string | undefined => {
  if (!values.length) {
    return undefined
  }

  const tokens = new Set<string>()
  appendNormalizedSearchTokens(tokens, values)
  return joinSearchTokenSet(tokens)
}

export const splitSearchText = (
  value: string | undefined
): readonly string[] => value
  ? value.split(SEARCH_TOKEN_SEPARATOR).filter(Boolean)
  : EMPTY_TEXTS

export const buildFieldSearchText = (
  field: Field | undefined,
  value: unknown
): string | undefined => {
  const tokens = fieldApi.search.tokens(field, value)
  if (!tokens.length) {
    return undefined
  }

  const normalized = new Set<string>()
  appendNormalizedSearchTokens(normalized, tokens)
  return joinSearchTokenSet(normalized)
}

export const buildRecordFieldSearchTextFromField = (
  record: DataRecord,
  fieldId: FieldId,
  field?: Field
): string | undefined => {
  if (!field && fieldId !== 'title') {
    return undefined
  }

  return buildFieldSearchText(
    field,
    fieldId === 'title'
      ? record.title
      : record.values[fieldId]
  )
}

export const buildRecordFieldSearchText = (
  record: DataRecord,
  fieldId: FieldId,
  document: DataDoc
): string | undefined => {
  const currentField = documentApi.fields.get(document, fieldId)
  return buildRecordFieldSearchTextFromField(record, fieldId, currentField)
}

const appendRecordDefaultSearchTokens = (
  target: Set<string>,
  record: DataRecord,
  fields: readonly CustomField[]
) => {
  const titleTokens = fieldApi.search.tokens(undefined, record.title)
  if (titleTokens.length) {
    appendNormalizedSearchTokens(target, titleTokens)
  }

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!
    const tokens = fieldApi.search.tokens(field, record.values[field.id])
    if (tokens.length) {
      appendNormalizedSearchTokens(target, tokens)
    }
  }
}

export const buildRecordDefaultSearchTextFromFields = (
  record: DataRecord,
  fields: readonly CustomField[]
): string | undefined => {
  const tokens = new Set<string>()
  appendRecordDefaultSearchTokens(tokens, record, fields)
  return joinSearchTokenSet(tokens)
}

export const buildRecordDefaultSearchText = (
  record: DataRecord,
  document: DataDoc
): string | undefined => {
  const fields: CustomField[] = []

  for (let index = 0; index < document.fields.order.length; index += 1) {
    const fieldId = document.fields.order[index]!
    const field = documentApi.fields.custom.get(document, fieldId)
    if (field && isDefaultSearchField(field)) {
      fields.push(field)
    }
  }

  return buildRecordDefaultSearchTextFromFields(record, fields)
}

export const buildRecordSearchTexts = (
  record: DataRecord,
  search: Pick<Search, 'fields'>,
  document: DataDoc
): readonly string[] => {
  if (search.fields?.length) {
    const texts: string[] = []

    for (let index = 0; index < search.fields.length; index += 1) {
      const fieldId = search.fields[index]!
      const text = buildRecordFieldSearchText(record, fieldId, document)
      if (text) {
        texts.push(text)
      }
    }

    return texts.length
      ? texts
      : EMPTY_TEXTS
  }

  const text = buildRecordDefaultSearchText(record, document)
  return text ? [text] : EMPTY_TEXTS
}
