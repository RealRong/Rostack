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
  SearchDemand,
  SearchIndex,
  SortedIdSet
} from './types'

const unique = (
  values: readonly string[]
): readonly string[] => Array.from(new Set(values.filter(Boolean).map(value => value.toLowerCase())))

const buildFieldTokens = (
  document: DataDoc,
  recordId: RecordId,
  fieldId: FieldId
): readonly string[] | undefined => {
  const record = document.records.byId[recordId]
  if (!record) {
    return undefined
  }

  return fieldId === 'title'
    ? unique(getFieldSearchTokens(getDocumentFieldById(document, 'title'), record.title))
    : unique(getFieldSearchTokens(
        getDocumentFieldById(document, fieldId),
        record.values[fieldId]
      ))
}

const buildAllTokens = (
  document: DataDoc,
  recordId: RecordId
): readonly string[] | undefined => {
  const record = document.records.byId[recordId]
  if (!record) {
    return undefined
  }

  return unique([
    ...(buildFieldTokens(document, recordId, 'title') ?? []),
    ...normalizeSearchableValue(record.type),
    ...normalizeSearchableValue(record.meta),
    ...document.fields.order.flatMap(fieldId => buildFieldTokens(document, recordId, fieldId) ?? [])
  ])
}

const cloneRecordTokens = (
  record: RecordTokens
): {
  all?: readonly string[]
  fields: Map<FieldId, readonly string[]>
} => ({
  ...(record.all ? { all: record.all } : {}),
  fields: new Map(record.fields)
})

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

const setRecordFieldTokens = (input: {
  records: Map<RecordId, RecordTokens>
  recordId: RecordId
  fieldId: FieldId
  tokens?: readonly string[]
}) => {
  const current = input.records.get(input.recordId)
  if (!current && !input.tokens?.length) {
    return
  }

  const next = current
    ? cloneRecordTokens(current)
    : {
        fields: new Map<FieldId, readonly string[]>()
      }

  if (input.tokens?.length) {
    next.fields.set(input.fieldId, input.tokens)
  } else {
    next.fields.delete(input.fieldId)
  }

  if (!next.all && !next.fields.size) {
    input.records.delete(input.recordId)
    return
  }

  input.records.set(input.recordId, next)
}

const setRecordAllTokens = (input: {
  records: Map<RecordId, RecordTokens>
  recordId: RecordId
  tokens?: readonly string[]
}) => {
  const current = input.records.get(input.recordId)
  if (!current && !input.tokens?.length) {
    return
  }

  const next = current
    ? cloneRecordTokens(current)
    : {
        fields: new Map<FieldId, readonly string[]>()
      }

  if (input.tokens?.length) {
    next.all = input.tokens
  } else {
    delete next.all
  }

  if (!next.all && !next.fields.size) {
    input.records.delete(input.recordId)
    return
  }

  input.records.set(input.recordId, next)
}

const buildFieldPostings = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): {
  postings: ReadonlyMap<string, SortedIdSet<RecordId>>
  recordTokens: ReadonlyMap<RecordId, readonly string[]>
} => {
  const postings = new Map<string, SortedIdSet<RecordId>>()
  const recordTokens = new Map<RecordId, readonly string[]>()
  const order = createOrderIndex(records.ids)

  records.ids.forEach(recordId => {
    const tokens = buildFieldTokens(document, recordId, fieldId)
    if (!tokens?.length) {
      return
    }

    recordTokens.set(recordId, tokens)
    addTokensToPostings(postings, tokens, recordId, order)
  })

  return {
    postings,
    recordTokens
  }
}

const buildAllPostings = (
  document: DataDoc,
  records: RecordIndex
): {
  postings: ReadonlyMap<string, SortedIdSet<RecordId>>
  recordTokens: ReadonlyMap<RecordId, readonly string[]>
} => {
  const postings = new Map<string, SortedIdSet<RecordId>>()
  const recordTokens = new Map<RecordId, readonly string[]>()
  const order = createOrderIndex(records.ids)

  records.ids.forEach(recordId => {
    const tokens = buildAllTokens(document, recordId)
    if (!tokens?.length) {
      return
    }

    recordTokens.set(recordId, tokens)
    addTokensToPostings(postings, tokens, recordId, order)
  })

  return {
    postings,
    recordTokens
  }
}

const normalizeDemand = (
  demand?: SearchDemand
): {
  all: boolean
  fields: ReadonlySet<FieldId>
} => ({
  all: demand?.all === true,
  fields: new Set(demand?.fields ?? [])
})

const removeFieldTokens = (
  records: Map<RecordId, RecordTokens>,
  fieldId: FieldId
) => {
  Array.from(records.entries()).forEach(([recordId, tokens]) => {
    if (!tokens.fields.has(fieldId)) {
      return
    }

    const next = cloneRecordTokens(tokens)
    next.fields.delete(fieldId)

    if (!next.all && !next.fields.size) {
      records.delete(recordId)
      return
    }

    records.set(recordId, next)
  })
}

export const buildSearchIndex = (
  document: DataDoc,
  records: RecordIndex,
  demand?: SearchDemand,
  rev = 1
): SearchIndex => {
  const base: SearchIndex = {
    fields: new Map(),
    records: new Map(),
    rev
  }
  const built = ensureSearchIndex(base, document, records, demand)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureSearchIndex = (
  previous: SearchIndex,
  document: DataDoc,
  records: RecordIndex,
  demand?: SearchDemand
): SearchIndex => {
  const normalized = normalizeDemand(demand)
  let changed = false
  let nextAll = previous.all
  const nextFields = new Map(previous.fields)
  const nextRecords = new Map(previous.records)

  if (normalized.all && !previous.all) {
    const built = buildAllPostings(document, records)
    nextAll = built.postings
    built.recordTokens.forEach((tokens, recordId) => {
      setRecordAllTokens({
        records: nextRecords,
        recordId,
        tokens
      })
    })
    changed = true
  }

  normalized.fields.forEach(fieldId => {
    if (nextFields.has(fieldId)) {
      return
    }

    const built = buildFieldPostings(document, records, fieldId)
    nextFields.set(fieldId, built.postings)
    built.recordTokens.forEach((tokens, recordId) => {
      setRecordFieldTokens({
        records: nextRecords,
        recordId,
        fieldId,
        tokens
      })
    })
    changed = true
  })

  return changed
    ? {
        ...(nextAll ? { all: nextAll } : {}),
        fields: nextFields,
        records: nextRecords,
        rev: previous.rev + 1
      }
    : previous
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

  const hasLoadedAll = Boolean(previous.all)
  const loadedFieldIds = new Set(previous.fields.keys())
  if (!hasLoadedAll && !loadedFieldIds.size) {
    return previous
  }

  const touchedRecords = collectTouchedRecordIds(delta)
  const schemaFields = collectSchemaFieldIds(delta)
  const valueFields = new Set<FieldId>()
  if (Array.isArray(delta.entities.values?.fields)) {
    delta.entities.values.fields.forEach(fieldId => valueFields.add(fieldId))
  }
  delta.semantics.forEach(item => {
    if (item.kind === 'record.values' && Array.isArray(item.fields)) {
      item.fields.forEach(fieldId => valueFields.add(fieldId))
    }
    if (item.kind === 'record.patch' && item.aspects.includes('title')) {
      valueFields.add('title')
    }
  })

  const rebuildAll = hasLoadedAll && (
    schemaFields.size > 0
    || touchedRecords === 'all'
  )
  const rebuildFieldIds = new Set<FieldId>(
    Array.from(loadedFieldIds).filter(fieldId => (
      schemaFields.has(fieldId)
      || touchedRecords === 'all'
    ))
  )

  let changed = false
  let nextAll = previous.all
  const nextFields = new Map(previous.fields)
  const nextRecords = new Map(previous.records)

  if (rebuildAll) {
    const built = buildAllPostings(document, records)
    nextAll = built.postings
    Array.from(nextRecords.keys()).forEach(recordId => {
      setRecordAllTokens({
        records: nextRecords,
        recordId
      })
    })
    built.recordTokens.forEach((tokens, recordId) => {
      setRecordAllTokens({
        records: nextRecords,
        recordId,
        tokens
      })
    })
    changed = true
  } else if (hasLoadedAll && touchedRecords !== 'all' && touchedRecords.size) {
    const postings = new Map(previous.all)
    const order = createOrderIndex(records.ids)

    touchedRecords.forEach(recordId => {
      const previousTokens = nextRecords.get(recordId)?.all
      if (previousTokens?.length) {
        removeTokensFromPostings(postings, previousTokens, recordId)
      }

      const nextTokens = buildAllTokens(document, recordId)
      setRecordAllTokens({
        records: nextRecords,
        recordId,
        tokens: nextTokens
      })

      if (nextTokens?.length) {
        addTokensToPostings(postings, nextTokens, recordId, order)
      }
    })

    nextAll = postings
    changed = true
  }

  Array.from(loadedFieldIds).forEach(fieldId => {
    if (schemaFields.has(fieldId) && !getDocumentFieldById(document, fieldId)) {
      nextFields.delete(fieldId)
      removeFieldTokens(nextRecords, fieldId)
      changed = true
      return
    }

    if (rebuildFieldIds.has(fieldId)) {
      const built = buildFieldPostings(document, records, fieldId)
      nextFields.set(fieldId, built.postings)
      removeFieldTokens(nextRecords, fieldId)
      built.recordTokens.forEach((tokens, recordId) => {
        setRecordFieldTokens({
          records: nextRecords,
          recordId,
          fieldId,
          tokens
        })
      })
      changed = true
      return
    }

    if (touchedRecords === 'all' || !touchedRecords.size || !valueFields.has(fieldId)) {
      return
    }

    const previousPostings = previous.fields.get(fieldId)
    if (!previousPostings) {
      return
    }

    const postings = new Map(previousPostings)
    const order = createOrderIndex(records.ids)

    touchedRecords.forEach(recordId => {
      const previousTokens = nextRecords.get(recordId)?.fields.get(fieldId)
      if (previousTokens?.length) {
        removeTokensFromPostings(postings, previousTokens, recordId)
      }

      const nextTokens = buildFieldTokens(document, recordId, fieldId)
      setRecordFieldTokens({
        records: nextRecords,
        recordId,
        fieldId,
        tokens: nextTokens
      })

      if (nextTokens?.length) {
        addTokensToPostings(postings, nextTokens, recordId, order)
      }
    })

    nextFields.set(fieldId, postings)
    changed = true
  })

  return changed
    ? {
        ...(nextAll ? { all: nextAll } : {}),
        fields: nextFields,
        records: nextRecords,
        rev: previous.rev + 1
      }
    : previous
}
