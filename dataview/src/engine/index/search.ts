import type {
  CommitDelta,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  getFieldSearchTokens,
  normalizeSearchableValue
} from '@dataview/core/field'
import type {
  RecordIndex,
  RecordTokens,
  SearchIndex
} from './types'

const unique = (
  values: readonly string[]
): readonly string[] => Array.from(new Set(values.filter(Boolean).map(value => value.toLowerCase())))

const buildRecordTokens = (
  document: DataDoc,
  recordId: RecordId
): RecordTokens | undefined => {
  const record = document.records.byId[recordId]
  if (!record) {
    return undefined
  }

  const fields = new Map<FieldId, readonly string[]>()
  fields.set('title', unique(getFieldSearchTokens(getDocumentFieldById(document, 'title'), record.title)))

  document.fields.order.forEach(fieldId => {
    fields.set(
      fieldId,
      unique(getFieldSearchTokens(getDocumentFieldById(document, fieldId), record.values[fieldId]))
    )
  })

  return {
    all: unique([
      ...(fields.get('title') ?? []),
      ...normalizeSearchableValue(record.type),
      ...normalizeSearchableValue(record.meta),
      ...document.fields.order.flatMap(fieldId => fields.get(fieldId) ?? [])
    ]),
    fields
  }
}

const buildPostings = (
  ids: readonly RecordId[],
  records: ReadonlyMap<RecordId, RecordTokens>
) => {
  const all = new Map<string, RecordId[]>()
  const fields = new Map<FieldId, Map<string, RecordId[]>>()

  ids.forEach(recordId => {
    const tokens = records.get(recordId)
    if (!tokens) {
      return
    }

    tokens.all.forEach(token => {
      const bucket = all.get(token) ?? []
      if (!all.has(token)) {
        all.set(token, bucket)
      }
      bucket.push(recordId)
    })

    tokens.fields.forEach((fieldTokens, fieldId) => {
      const postings = fields.get(fieldId) ?? new Map<string, RecordId[]>()
      if (!fields.has(fieldId)) {
        fields.set(fieldId, postings)
      }

      fieldTokens.forEach(token => {
        const bucket = postings.get(token) ?? []
        if (!postings.has(token)) {
          postings.set(token, bucket)
        }
        bucket.push(recordId)
      })
    })
  })

  return {
    all,
    fields
  }
}

const buildTokensMap = (
  document: DataDoc,
  ids: readonly RecordId[]
) => new Map(
  ids.flatMap(recordId => {
    const tokens = buildRecordTokens(document, recordId)
    return tokens
      ? [[recordId, tokens] as const]
      : []
  })
)

const collectTouchedRecordIds = (
  delta: CommitDelta
) => {
  if (
    delta.entities.records?.update === 'all'
    || delta.entities.values?.records === 'all'
  ) {
    return 'all' as const
  }

  const ids = new Set<RecordId>()
  delta.entities.records?.add?.forEach(id => ids.add(id))
  if (Array.isArray(delta.entities.records?.update)) {
    delta.entities.records.update.forEach(id => ids.add(id))
  }
  delta.entities.records?.remove?.forEach(id => ids.add(id))
  if (Array.isArray(delta.entities.values?.records)) {
    delta.entities.values.records.forEach(id => ids.add(id))
  }

  for (const item of delta.semantics) {
    if (item.kind === 'record.patch') {
      item.ids.forEach(id => ids.add(id))
    }
  }

  return ids
}

export const buildSearchIndex = (
  document: DataDoc,
  records: RecordIndex,
  rev = 1
): SearchIndex => {
  const tokens = buildTokensMap(document, records.ids)
  const postings = buildPostings(records.ids, tokens)

  return {
    all: postings.all,
    fields: postings.fields,
    records: tokens,
    rev
  }
}

export const syncSearchIndex = (
  previous: SearchIndex,
  document: DataDoc,
  records: RecordIndex,
  delta: CommitDelta
): SearchIndex => {
  if (!delta.summary.indexes) {
    return previous
  }

  if (
    delta.entities.fields?.add?.length
    || delta.entities.fields?.update?.length
    || delta.entities.fields?.remove?.length
  ) {
    return buildSearchIndex(document, records, previous.rev + 1)
  }

  const touched = collectTouchedRecordIds(delta)
  if (touched === 'all') {
    return buildSearchIndex(document, records, previous.rev + 1)
  }

  if (!touched.size) {
    return previous
  }

  const nextRecords = new Map(previous.records)
  touched.forEach(recordId => {
    const tokens = buildRecordTokens(document, recordId)
    if (tokens) {
      nextRecords.set(recordId, tokens)
      return
    }

    nextRecords.delete(recordId)
  })

  const postings = buildPostings(records.ids, nextRecords)
  return {
    all: postings.all,
    fields: postings.fields,
    records: nextRecords,
    rev: previous.rev + 1
  }
}
