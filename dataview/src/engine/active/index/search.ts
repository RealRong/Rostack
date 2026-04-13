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
  getFieldSearchTokens
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
} from './sync'
import type {
  RecordIndex,
  SearchDemand,
  SearchIndex,
  SearchTextIndex
} from './types'

const TOKEN_SEPARATOR = '\u0000'

const normalizeTokens = (
  values: readonly string[]
): string | undefined => {
  const tokens = unique(values.flatMap(value => {
    const token = trimLowercase(value)
    return token ? [token] : []
  }))

  return tokens.length
    ? tokens.join(TOKEN_SEPARATOR)
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
      ? nextTokens.split(TOKEN_SEPARATOR)
      : nextTokens

    values?.forEach(token => {
      if (token) {
        tokens.add(token.toLowerCase())
      }
    })
  }

  addTokens(getFieldSearchTokens(undefined, record.title))
  fields.forEach(({ id, field }) => {
    addTokens(buildFieldTokens(record, id, field))
  })

  return normalizeTokens(Array.from(tokens))
}

const isDefaultSearchField = (
  field: ReturnType<typeof getDocumentFieldById>
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

const buildTextIndex = (input: {
  ids: readonly RecordId[]
  readText: (recordId: RecordId) => string | undefined
}): SearchTextIndex => {
  const texts = new Map<RecordId, string>()

  input.ids.forEach(recordId => {
    const text = input.readText(recordId)
    if (!text) {
      return
    }

    texts.set(recordId, text)
  })

  return {
    texts
  }
}

const updateTextIndex = (input: {
  previous: SearchTextIndex
  touchedRecords: ReadonlySet<RecordId>
  readText: (recordId: RecordId) => string | undefined
}): SearchTextIndex => {
  const texts = new Map(input.previous.texts)
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const previousText = texts.get(recordId)
    const nextText = input.readText(recordId)
    if (previousText === nextText) {
      return
    }

    if (nextText) {
      texts.set(recordId, nextText)
    } else {
      texts.delete(recordId)
    }

    changed = true
  })

  return changed
    ? {
        texts
      }
    : input.previous
}

const buildFieldIndex = (
  document: DataDoc,
  records: RecordIndex,
  fieldId: FieldId
): SearchTextIndex => {
  const field = getDocumentFieldById(document, fieldId)
  if (!field && fieldId !== 'title') {
    return {
      texts: new Map()
    }
  }

  return buildTextIndex({
    ids: records.ids,
    readText: recordId => {
      const record = records.rows.get(recordId)
      return record
        ? buildFieldTokens(record, fieldId, field)
        : undefined
    }
  })
}

const buildAllIndex = (
  document: DataDoc,
  records: RecordIndex
): SearchTextIndex => {
  const fields = document.fields.order
    .map(fieldId => ({
      id: fieldId,
      field: getDocumentFieldById(document, fieldId)
    }))
    .filter(({ field }) => isDefaultSearchField(field))

  return buildTextIndex({
    ids: records.ids,
    readText: recordId => {
      const record = records.rows.get(recordId)
      return record
        ? buildAllTokens(record, fields)
        : undefined
    }
  })
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
    nextAll = buildAllIndex(document, records)
    changed = true
  }

  normalized.fields.forEach(fieldId => {
    if (nextFields.has(fieldId)) {
      return
    }

    nextFields.set(fieldId, buildFieldIndex(document, records, fieldId))
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
    nextAll = buildAllIndex(document, records)
    changed = true
  } else if (hasLoadedAll && context.touchedRecords !== 'all' && context.touchedRecords.size) {
    const next = updateTextIndex({
      previous: previous.all!,
      touchedRecords: context.touchedRecords,
      readText: recordId => {
        const record = records.rows.get(recordId)
        return record
          ? buildAllTokens(record, allFields)
          : undefined
      }
    })
    if (next !== previous.all) {
      nextAll = next
      changed = true
    }
  }

  Array.from(loadedFieldIds).forEach(fieldId => {
    if (shouldDropFieldIndex(document, context, fieldId)) {
      nextFields.delete(fieldId)
      changed = true
      return
    }

    if (rebuildFieldIds.has(fieldId)) {
      nextFields.set(fieldId, buildFieldIndex(document, records, fieldId))
      changed = true
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const previousField = previous.fields.get(fieldId)
    if (!previousField) {
      return
    }

    const nextField = updateTextIndex({
      previous: previousField,
      touchedRecords: context.touchedRecords,
      readText: recordId => {
        const record = records.rows.get(recordId)
        return record
          ? buildFieldTokens(record, fieldId, getDocumentFieldById(document, fieldId))
          : undefined
      }
    })

    if (nextField !== previousField) {
      nextFields.set(fieldId, nextField)
      changed = true
    }
  })

  return changed
    ? {
        ...(nextAll ? { all: nextAll } : {}),
        fields: nextFields,
        rev: previous.rev + 1
      }
    : previous
}
