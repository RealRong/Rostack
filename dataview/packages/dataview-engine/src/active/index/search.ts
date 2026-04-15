import type {
  CommitImpact,
  DataDoc,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  buildRecordDefaultSearchText,
  buildRecordFieldSearchText
} from '@dataview/core/search'
import {
  createFieldSyncContext,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'
import {
  hasIndexChanges
} from '@dataview/engine/active/index/shared'
import type {
  RecordIndex,
  SearchDemand,
  SearchIndex,
  SearchTextIndex
} from '@dataview/engine/active/index/contracts'

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
  if (fieldId !== 'title' && !document.fields.byId[fieldId]) {
    return {
      texts: new Map()
    }
  }

  return buildTextIndex({
    ids: records.ids,
    readText: recordId => {
      const record = records.rows.get(recordId)
      return record
        ? buildRecordFieldSearchText(record, fieldId, document)
        : undefined
    }
  })
}

const buildAllIndex = (
  document: DataDoc,
  records: RecordIndex
): SearchTextIndex => buildTextIndex({
    ids: records.ids,
    readText: recordId => {
      const record = records.rows.get(recordId)
      return record
        ? buildRecordDefaultSearchText(record, document)
        : undefined
    }
  })

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
  impact: CommitImpact
): SearchIndex => {
  if (!hasIndexChanges(impact)) {
    return previous
  }

  const hasLoadedAll = Boolean(previous.all)
  const loadedFieldIds = new Set(previous.fields.keys())
  if (!hasLoadedAll && !loadedFieldIds.size) {
    return previous
  }

  const context = createFieldSyncContext(impact, {
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
          ? buildRecordDefaultSearchText(record, document)
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
          ? buildRecordFieldSearchText(record, fieldId, document)
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
