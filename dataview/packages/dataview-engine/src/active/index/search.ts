import {
  search
} from '@dataview/core/view'
import { collection } from '@shared/core'
import type {
  Field,
  FieldId,
  RecordId
} from '@dataview/core/types'
import {
  createMapDraft as createMapPatchBuilder
} from '@shared/draft'
import {
  applyOrderedIdDelta
} from '@dataview/engine/active/shared/ordered'
import type {
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex,
  SearchFieldIndex,
  SearchIndex
} from '@dataview/engine/active/index/contracts'
import {
  ensureFieldIndexes,
  shouldDropFieldIndex,
  shouldRebuildFieldIndex,
  shouldSyncFieldIndex
} from '@dataview/engine/active/index/sync'

const EMPTY_SEARCH_TEXTS = new Map<RecordId, string>()
const EMPTY_SEARCH_POSTINGS = new Map<string, readonly RecordId[]>()
const EMPTY_RECORD_IDS = [] as readonly RecordId[]
const EMPTY_GRAMS = [] as readonly string[]
const GRAM_CACHE_LIMIT = 10_000
const GRAMS2_BY_TEXT = new Map<string, readonly string[]>()
const GRAMS3_BY_TEXT = new Map<string, readonly string[]>()

const resolveSearchField = (
  context: Pick<IndexReadContext, 'reader'>,
  fieldId: FieldId
): Field | undefined => fieldId === 'title'
  ? undefined
  : context.reader.fields.get(fieldId)

const writeGramCache = (
  cache: Map<string, readonly string[]>,
  text: string,
  grams: readonly string[]
): readonly string[] => {
  if (cache.size >= GRAM_CACHE_LIMIT) {
    cache.clear()
  }

  cache.set(text, grams)
  return grams
}

const collectSearchGrams = (
  text: string | undefined,
  size: 2 | 3
): readonly string[] => {
  if (!text || text.length < size) {
    return EMPTY_GRAMS
  }

  const cache = size === 2
    ? GRAMS2_BY_TEXT
    : GRAMS3_BY_TEXT
  const cached = cache.get(text)
  if (cached) {
    return cached
  }

  const grams = new Set<string>()
  const maxStart = text.length - size

  for (let start = 0; start <= maxStart; start += 1) {
    grams.add(text.slice(start, start + size))
  }

  return writeGramCache(
    cache,
    text,
    grams.size
      ? [...grams]
      : EMPTY_GRAMS
  )
}

const addPosting = (
  target: Map<string, RecordId[]>,
  key: string,
  recordId: RecordId
) => {
  const current = target.get(key)
  if (current) {
    current.push(recordId)
    return
  }

  target.set(key, [recordId])
}

const collectPostingDelta = (input: {
  previousText: string | undefined
  nextText: string | undefined
  recordId: RecordId
  size: 2 | 3
  touchedKeys: Set<string>
  removedByKey: Map<string, RecordId[]>
  addedByKey: Map<string, RecordId[]>
}) => {
  const previousKeys = collectSearchGrams(input.previousText, input.size)
  const nextKeys = collectSearchGrams(input.nextText, input.size)
  if (previousKeys.length === nextKeys.length) {
    const nextSet = new Set(nextKeys)
    if (previousKeys.every(key => nextSet.has(key))) {
      return
    }
  }

  const previousSet = new Set(previousKeys)
  const nextSet = new Set(nextKeys)

  previousKeys.forEach(key => {
    input.touchedKeys.add(key)
    if (!nextSet.has(key)) {
      addPosting(input.removedByKey, key, input.recordId)
    }
  })
  nextKeys.forEach(key => {
    input.touchedKeys.add(key)
    if (!previousSet.has(key)) {
      addPosting(input.addedByKey, key, input.recordId)
    }
  })
}

const createEmptyFieldIndex = (
  fieldId: FieldId,
  rev = 1
): SearchFieldIndex => ({
  fieldId,
  texts: EMPTY_SEARCH_TEXTS,
  grams2: EMPTY_SEARCH_POSTINGS,
  grams3: EMPTY_SEARCH_POSTINGS,
  rev
})

const buildTextIndex = (input: {
  fieldId: FieldId
  ids: readonly RecordId[]
  readText: (recordId: RecordId) => string | undefined
  rev?: number
}): SearchFieldIndex => {
  if (!input.ids.length) {
    return createEmptyFieldIndex(input.fieldId, input.rev)
  }

  const texts = new Map<RecordId, string>()
  const grams2 = new Map<string, RecordId[]>()
  const grams3 = new Map<string, RecordId[]>()

  for (let index = 0; index < input.ids.length; index += 1) {
    const recordId = input.ids[index]!
    const text = input.readText(recordId)
    if (!text) {
      continue
    }

    texts.set(recordId, text)
    collectSearchGrams(text, 2).forEach(key => {
      addPosting(grams2, key, recordId)
    })
    collectSearchGrams(text, 3).forEach(key => {
      addPosting(grams3, key, recordId)
    })
  }

  return {
    fieldId: input.fieldId,
    texts,
    grams2,
    grams3,
    rev: input.rev ?? 1
  }
}

const updateTextIndex = (input: {
  previous: SearchFieldIndex
  touchedRecords: ReadonlySet<RecordId>
  records: RecordIndex
  readText: (recordId: RecordId) => string | undefined
}): SearchFieldIndex => {
  const previousTexts = input.previous.texts
  const texts = createMapPatchBuilder(previousTexts)
  const grams2 = createMapPatchBuilder(input.previous.grams2)
  const grams3 = createMapPatchBuilder(input.previous.grams3)
  const touchedKeys2 = new Set<string>()
  const touchedKeys3 = new Set<string>()
  const removedByKey2 = new Map<string, RecordId[]>()
  const addedByKey2 = new Map<string, RecordId[]>()
  const removedByKey3 = new Map<string, RecordId[]>()
  const addedByKey3 = new Map<string, RecordId[]>()
  let changed = false

  input.touchedRecords.forEach(recordId => {
    const previousText = previousTexts.get(recordId)
    const nextText = input.readText(recordId)
    if (previousText === nextText) {
      return
    }

    changed = true
    if (nextText) {
      texts.set(recordId, nextText)
    } else {
      texts.delete(recordId)
    }

    collectPostingDelta({
      previousText,
      nextText,
      recordId,
      size: 2,
      touchedKeys: touchedKeys2,
      removedByKey: removedByKey2,
      addedByKey: addedByKey2
    })
    collectPostingDelta({
      previousText,
      nextText,
      recordId,
      size: 3,
      touchedKeys: touchedKeys3,
      removedByKey: removedByKey3,
      addedByKey: addedByKey3
    })
  })

  if (!changed) {
    return input.previous
  }

  touchedKeys2.forEach(key => {
    const nextIds = applyOrderedIdDelta({
      previous: input.previous.grams2.get(key) ?? EMPTY_RECORD_IDS,
      remove: collection.presentSet(removedByKey2.get(key)),
      add: addedByKey2.get(key),
      order: input.records.order
    })
    if (nextIds.length) {
      grams2.set(key, nextIds)
      return
    }

    grams2.delete(key)
  })

  touchedKeys3.forEach(key => {
    const nextIds = applyOrderedIdDelta({
      previous: input.previous.grams3.get(key) ?? EMPTY_RECORD_IDS,
      remove: collection.presentSet(removedByKey3.get(key)),
      add: addedByKey3.get(key),
      order: input.records.order
    })
    if (nextIds.length) {
      grams3.set(key, nextIds)
      return
    }

    grams3.delete(key)
  })

  return {
    fieldId: input.previous.fieldId,
    texts: texts.finish(),
    grams2: grams2.finish(),
    grams3: grams3.finish(),
    rev: input.previous.rev + 1
  }
}

const buildFieldIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  fieldId: FieldId,
  rev = 1
): SearchFieldIndex => {
  const field = resolveSearchField(context, fieldId)
  if (fieldId !== 'title' && !field) {
    return createEmptyFieldIndex(fieldId, rev)
  }

  const column = records.values.get(fieldId)
  if (!column?.ids.length) {
    return createEmptyFieldIndex(fieldId, rev)
  }

  return buildTextIndex({
    fieldId,
    ids: column.ids,
    readText: recordId => search.record.valueText(
      field,
      column.byRecord.get(recordId)
    ),
    rev
  })
}

export const buildSearchIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  demand: readonly FieldId[] = [],
  _rev = 1
): SearchIndex => ({
  fields: new Map(
    demand.map(fieldId => [
      fieldId,
      buildFieldIndex(context, records, fieldId)
    ] as const)
  )
})

export const ensureSearchIndex = (
  previous: SearchIndex,
  context: IndexReadContext,
  records: RecordIndex,
  demand: readonly FieldId[] = []
): SearchIndex => {
  const nextFieldSet = new Set(demand)
  const fields = createMapPatchBuilder(previous.fields)

  previous.fields.forEach((_, fieldId) => {
    if (!nextFieldSet.has(fieldId)) {
      fields.delete(fieldId)
    }
  })

  const ensured = ensureFieldIndexes({
    previous: fields.finish(),
    hasField: fieldId => context.fieldIdSet.has(fieldId),
    fieldIds: demand,
    build: fieldId => buildFieldIndex(context, records, fieldId)
  })

  return ensured.changed || fields.changed()
    ? {
        fields: ensured.fields
      }
    : previous
}

export const syncSearchIndex = (
  previous: SearchIndex,
  context: IndexDeriveContext,
  records: RecordIndex
): SearchIndex => {
  if (!context.changed || !previous.fields.size) {
    return previous
  }

  const fields = createMapPatchBuilder(previous.fields)

  previous.fields.forEach((previousField, fieldId) => {
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context, fieldId)) {
      fields.delete(fieldId)
      return
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      fields.set(fieldId, buildFieldIndex(context, records, fieldId, previousField.rev + 1))
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const field = resolveSearchField(context, fieldId)
    const column = records.values.get(fieldId)
    const nextField = updateTextIndex({
      previous: previousField,
      touchedRecords: context.touchedRecords,
      records,
      readText: recordId => search.record.valueText(
        field,
        column?.byRecord.get(recordId)
      )
    })

    if (nextField !== previousField) {
      fields.set(fieldId, nextField)
    }
  })

  return fields.changed()
    ? {
        fields: fields.finish()
      }
    : previous
}
