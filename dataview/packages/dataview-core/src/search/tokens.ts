import type {
  CustomField,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  Search
} from '@dataview/core/contracts'
import {
  getDocumentCustomFieldById,
  getDocumentFieldById
} from '@dataview/core/document'
import {
  getFieldSearchTokens
} from '@dataview/core/field'
import {
  trimLowercase,
  unique
} from '@shared/core'

const EMPTY_TEXTS = [] as readonly string[]

export const SEARCH_TOKEN_SEPARATOR = '\u0000'

export const isDefaultSearchField = (
  field: CustomField | undefined
): boolean => {
  switch (field?.kind) {
    case 'text':
    case 'url':
    case 'email':
    case 'phone':
    case 'select':
    case 'multiSelect':
    case 'status':
      return true
    default:
      return false
  }
}

export const normalizeSearchTokens = (
  values: readonly string[]
): readonly string[] => unique(values.flatMap(value => {
  const token = trimLowercase(value)
  return token ? [token] : []
}))

export const joinSearchTokens = (
  values: readonly string[]
): string | undefined => {
  const tokens = normalizeSearchTokens(values)
  return tokens.length
    ? tokens.join(SEARCH_TOKEN_SEPARATOR)
    : undefined
}

export const splitSearchText = (
  value: string | undefined
): readonly string[] => value
  ? value.split(SEARCH_TOKEN_SEPARATOR).filter(Boolean)
  : EMPTY_TEXTS

export const buildFieldSearchText = (
  field: Field | undefined,
  value: unknown
): string | undefined => joinSearchTokens(
  getFieldSearchTokens(field, value)
)

export const buildRecordFieldSearchText = (
  record: DataRecord,
  fieldId: FieldId,
  document: DataDoc
): string | undefined => {
  const field = getDocumentFieldById(document, fieldId)
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

export const buildRecordDefaultSearchText = (
  record: DataRecord,
  document: DataDoc
): string | undefined => {
  const tokens = new Set<string>()
  const addText = (value: string | undefined) => {
    splitSearchText(value).forEach(token => {
      tokens.add(token)
    })
  }

  addText(buildFieldSearchText(undefined, record.title))

  document.fields.order.forEach(fieldId => {
    const field = getDocumentCustomFieldById(document, fieldId)
    if (!isDefaultSearchField(field)) {
      return
    }

    addText(buildFieldSearchText(field, record.values[fieldId]))
  })

  return tokens.size
    ? Array.from(tokens).join(SEARCH_TOKEN_SEPARATOR)
    : undefined
}

export const buildRecordSearchTexts = (
  record: DataRecord,
  search: Pick<Search, 'fields'>,
  document: DataDoc
): readonly string[] => {
  if (search.fields?.length) {
    return search.fields.flatMap(fieldId => {
      const text = buildRecordFieldSearchText(record, fieldId, document)
      return text ? [text] : []
    })
  }

  const text = buildRecordDefaultSearchText(record, document)
  return text ? [text] : EMPTY_TEXTS
}
