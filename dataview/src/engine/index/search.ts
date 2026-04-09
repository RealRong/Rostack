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
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  createOrderIndex,
  insertOrderedId,
  removeOrderedId
} from './shared'
import type {
  RecordIndex,
  RecordTokens,
  SearchIndex,
  SortedIdSet
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

const removeTokensFromPostings = (
  postings: Map<string, SortedIdSet<RecordId>>,
  tokens: readonly string[],
  recordId: RecordId
) => {
  tokens.forEach(token => {
    const ids = postings.get(token)
    if (!ids) {
      return
    }

    const nextIds = removeOrderedId(ids, recordId)
    if (nextIds.length) {
      postings.set(token, nextIds)
      return
    }

    postings.delete(token)
  })
}

const addTokensToPostings = (
  postings: Map<string, SortedIdSet<RecordId>>,
  tokens: readonly string[],
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
) => {
  tokens.forEach(token => {
    postings.set(
      token,
      insertOrderedId(postings.get(token) ?? [], recordId, order)
    )
  })
}

const removeRecordPostings = (
  fields: Map<FieldId, Map<string, SortedIdSet<RecordId>>>,
  record: RecordTokens,
  recordId: RecordId
) => {
  record.fields.forEach((tokens, fieldId) => {
    const postings = fields.get(fieldId)
    if (!postings) {
      return
    }

    removeTokensFromPostings(postings, tokens, recordId)
    if (!postings.size) {
      fields.delete(fieldId)
    }
  })
}

const addRecordPostings = (
  fields: Map<FieldId, Map<string, SortedIdSet<RecordId>>>,
  record: RecordTokens,
  recordId: RecordId,
  order: ReadonlyMap<RecordId, number>
) => {
  record.fields.forEach((tokens, fieldId) => {
    const postings = fields.get(fieldId) ?? new Map<string, SortedIdSet<RecordId>>()
    if (!fields.has(fieldId)) {
      fields.set(fieldId, postings)
    }

    addTokensToPostings(postings, tokens, recordId, order)
  })
}

const collectRecordsToSync = (input: {
  previous: SearchIndex
  records: RecordIndex
  delta: CommitDelta
}): ReadonlySet<RecordId> => {
  const ids = new Set<RecordId>()
  const touched = collectTouchedRecordIds(input.delta)
  const schemaFields = collectSchemaFieldIds(input.delta)

  if (touched === 'all' || schemaFields.size > 0) {
    input.previous.records.forEach((_tokens, recordId) => ids.add(recordId))
    input.records.ids.forEach(recordId => ids.add(recordId))
    return ids
  }

  touched.forEach(recordId => ids.add(recordId))
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

  const touched = collectRecordsToSync({
    previous,
    records,
    delta
  })
  if (!touched.size) {
    return previous
  }

  const order = createOrderIndex(records.ids)
  const nextRecords = new Map(previous.records)
  const nextAll = new Map(previous.all)
  const nextFields = new Map(
    Array.from(previous.fields.entries(), ([fieldId, postings]) => [
      fieldId,
      new Map(postings)
    ] as const)
  )

  touched.forEach(recordId => {
    const previousTokens = nextRecords.get(recordId)
    if (previousTokens) {
      removeTokensFromPostings(nextAll, previousTokens.all, recordId)
      removeRecordPostings(nextFields, previousTokens, recordId)
      nextRecords.delete(recordId)
    }

    const nextTokens = buildRecordTokens(document, recordId)
    if (!nextTokens) {
      return
    }

    addTokensToPostings(nextAll, nextTokens.all, recordId, order)
    addRecordPostings(nextFields, nextTokens, recordId, order)
    nextRecords.set(recordId, nextTokens)
  })

  return {
    all: nextAll,
    fields: nextFields,
    records: nextRecords,
    rev: previous.rev + 1
  }
}
