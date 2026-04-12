import type {
  CommitDelta,
  DataDoc,
  FieldId,
  RecordId,
  DataRecord
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  getFieldSearchTokens,
  normalizeSearchableValue
} from '@dataview/core/field'
import {
  trimLowercase,
  unique
} from '@shared/core'
import {
  createFieldSyncContext,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '../runtime/sync'
import type {
  RecordIndex,
  SearchDemand,
  SearchIndex
} from '../types'

const normalizeTokens = (
  values: readonly string[]
): string | undefined => {
  const tokens = unique(values.flatMap(value => {
    const token = trimLowercase(value)
    return token ? [token] : []
  }))

  return tokens.length
    ? tokens.join('\u0000')
    : undefined
}

const buildFieldTokens = (
  record: DataRecord,
  fieldId: FieldId,
  field?: ReturnType<typeof getDocumentFieldById>
): string | undefined => normalizeTokens(
  fieldId === 'title'
    ? getFieldSearchTokens(field, record.title)
    : getFieldSearchTokens(field, record.values[fieldId])
)

const buildAllTokens = (
  record: DataRecord,
  fields: readonly {
    id: FieldId
    field: ReturnType<typeof getDocumentFieldById>
  }[]
): string | undefined => {
  const tokens = new Set<string>()
  const addTokens = (nextTokens: readonly string[] | string | undefined) => {
    const values = typeof nextTokens === 'string'
      ? nextTokens.split('\u0000')
      : nextTokens

    values?.forEach(token => {
      if (token) {
        tokens.add(token.toLowerCase())
      }
    })
  }

  addTokens(getFieldSearchTokens(undefined, record.title))
  addTokens(normalizeSearchableValue(record.type))
  addTokens(normalizeSearchableValue(record.meta))
  fields.forEach(({ id, field }) => {
    addTokens(buildFieldTokens(record, id, field))
  })

  return normalizeTokens(Array.from(tokens))
}

const buildFieldTexts = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): ReadonlyMap<RecordId, string> => {
  const texts = new Map<RecordId, string>()
  const field = getDocumentFieldById(document, fieldId)

  if (!field && fieldId !== 'title') {
    return texts
  }

  records.ids.forEach(recordId => {
    const record = records.rows.get(recordId)
    if (!record) {
      return
    }

    const tokens = buildFieldTokens(record, fieldId, field)
    if (!tokens) {
      return
    }

    texts.set(recordId, tokens)
  })

  return texts
}

const buildAllTexts = (
  document: DataDoc,
  records: RecordIndex
): ReadonlyMap<RecordId, string> => {
  const texts = new Map<RecordId, string>()
  const fields = document.fields.order.map(fieldId => ({
    id: fieldId,
    field: getDocumentFieldById(document, fieldId)
  }))

  records.ids.forEach(recordId => {
    const record = records.rows.get(recordId)
    if (!record) {
      return
    }

    const tokens = buildAllTokens(record, fields)
    if (!tokens) {
      return
    }

    texts.set(recordId, tokens)
  })

  return texts
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

export const buildSearchIndex = (
  document: DataDoc,
  records: RecordIndex,
  demand?: SearchDemand,
  rev = 1
): SearchIndex => {
  const base: SearchIndex = {
    fields: new Map(),
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

  if (normalized.all && !previous.all) {
    nextAll = buildAllTexts(document, records)
    changed = true
  }

  normalized.fields.forEach(fieldId => {
    if (nextFields.has(fieldId)) {
      return
    }

    nextFields.set(fieldId, buildFieldTexts(document, records, fieldId))
    changed = true
  })

  return changed
    ? {
        ...(nextAll ? { all: nextAll } : {}),
        fields: nextFields,
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

  const context = createFieldSyncContext(delta, {
    includeTitlePatch: true,
    includeRecordSetChange: true
  })

  const rebuildAll = hasLoadedAll && (
    context.schemaFields.size > 0
    || context.touchedRecords === 'all'
  )
  const rebuildFieldIds = new Set<FieldId>(
    Array.from(loadedFieldIds).filter(fieldId => (
      shouldRebuildFieldIndex(context, fieldId)
    ))
  )

  let changed = false
  let nextAll = previous.all
  const nextFields = new Map(previous.fields)
  const allFields = document.fields.order.map(fieldId => ({
    id: fieldId,
    field: getDocumentFieldById(document, fieldId)
  }))
  if (rebuildAll) {
    nextAll = buildAllTexts(document, records)
    changed = true
  } else if (hasLoadedAll && context.touchedRecords !== 'all' && context.touchedRecords.size) {
    const texts = new Map(previous.all!)

    context.touchedRecords.forEach(recordId => {
      const record = records.rows.get(recordId)
      const nextText = record
        ? buildAllTokens(record, allFields)
        : undefined
      if (nextText) {
        texts.set(recordId, nextText)
        return
      }

      texts.delete(recordId)
    })

    nextAll = texts
    changed = true
  }

  Array.from(loadedFieldIds).forEach(fieldId => {
    if (shouldDropFieldIndex(document, context, fieldId)) {
      nextFields.delete(fieldId)
      changed = true
      return
    }

    if (rebuildFieldIds.has(fieldId)) {
      nextFields.set(fieldId, buildFieldTexts(document, records, fieldId))
      changed = true
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const texts = new Map(previous.fields.get(fieldId))
    context.touchedRecords.forEach(recordId => {
      const record = records.rows.get(recordId)
      const nextText = record
        ? buildFieldTokens(record, fieldId, getDocumentFieldById(document, fieldId))
        : undefined

      if (nextText) {
        texts.set(recordId, nextText)
        return
      }

      texts.delete(recordId)
    })
    nextFields.set(fieldId, texts)
    changed = true
  })

  return changed
    ? {
        ...(nextAll ? { all: nextAll } : {}),
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}
