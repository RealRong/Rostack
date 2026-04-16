import {
  buildFieldSearchText,
  isDefaultSearchField,
  joinSearchTokens,
  splitSearchText
} from '@dataview/core/search'
import type {
  Field,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import {
  createMapPatchBuilder
} from '@dataview/engine/active/shared/patch'
import {
  applyOrderedIdDelta
} from '@dataview/engine/active/shared/ordered'
import type {
  IndexDeriveContext,
  IndexReadContext,
  RecordIndex,
  SearchDemand,
  SearchIndex,
  SearchTextIndex
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

const resolveSearchField = (
  context: Pick<IndexReadContext, 'reader'>,
  fieldId: FieldId
): Field | undefined => fieldId === 'title'
  ? undefined
  : context.reader.fields.get(fieldId)

const resolveDefaultSearchFieldIds = (
  context: Pick<IndexReadContext, 'document' | 'reader'>
): readonly FieldId[] => {
  const fieldIds: FieldId[] = ['title']

  for (let index = 0; index < context.document.fields.order.length; index += 1) {
    const fieldId = context.document.fields.order[index]!
    const field = context.reader.fields.get(fieldId)
    if (field && field.kind !== 'title' && isDefaultSearchField(field)) {
      fieldIds.push(fieldId)
    }
  }

  return fieldIds
}

const createRecordIdSet = (
  ids?: readonly RecordId[]
): ReadonlySet<RecordId> | undefined => ids?.length
  ? new Set(ids)
  : undefined

const collectSearchGrams = (
  text: string | undefined,
  size: 2 | 3
): readonly string[] => {
  if (!text || text.length < size) {
    return EMPTY_GRAMS
  }

  const grams = new Set<string>()
  const maxStart = text.length - size

  for (let start = 0; start <= maxStart; start += 1) {
    grams.add(text.slice(start, start + size))
  }

  return grams.size
    ? [...grams]
    : EMPTY_GRAMS
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
  if (
    previousKeys.length === nextKeys.length
    && previousKeys.every(key => nextKeys.includes(key))
  ) {
    return
  }

  previousKeys.forEach(key => {
    input.touchedKeys.add(key)
    if (!nextKeys.includes(key)) {
      addPosting(input.removedByKey, key, input.recordId)
    }
  })
  nextKeys.forEach(key => {
    input.touchedKeys.add(key)
    if (!previousKeys.includes(key)) {
      addPosting(input.addedByKey, key, input.recordId)
    }
  })
}

const readFieldSearchText = (input: {
  records: RecordIndex
  recordId: RecordId
  fieldId: FieldId
  field: Field | undefined
}): string | undefined => buildFieldSearchText(
  input.field,
  input.records.values.get(input.fieldId)?.byRecord.get(input.recordId)
)

const readCombinedSearchText = (input: {
  records: RecordIndex
  recordId: RecordId
  fields: readonly {
    fieldId: FieldId
    field: Field | undefined
  }[]
}): string | undefined => {
  const tokens: string[] = []

  for (let index = 0; index < input.fields.length; index += 1) {
    const entry = input.fields[index]!
    const text = readFieldSearchText({
      records: input.records,
      recordId: input.recordId,
      fieldId: entry.fieldId,
      field: entry.field
    })
    if (text) {
      tokens.push(...splitSearchText(text))
    }
  }

  return tokens.length
    ? joinSearchTokens(tokens)
    : undefined
}

const buildTextIndex = (input: {
  ids: readonly RecordId[]
  readText: (recordId: RecordId) => string | undefined
}): SearchTextIndex => {
  const texts = new Map<RecordId, string>()
  const bigrams = new Map<string, RecordId[]>()
  const trigrams = new Map<string, RecordId[]>()

  for (let index = 0; index < input.ids.length; index += 1) {
    const recordId = input.ids[index]!
    const text = input.readText(recordId)
    if (!text) {
      continue
    }

    texts.set(recordId, text)
    collectSearchGrams(text, 2).forEach(key => {
      addPosting(bigrams, key, recordId)
    })
    collectSearchGrams(text, 3).forEach(key => {
      addPosting(trigrams, key, recordId)
    })
  }

  return {
    texts,
    bigrams,
    trigrams
  }
}

const updateTextIndex = (input: {
  previous: SearchTextIndex
  touchedRecords: ReadonlySet<RecordId>
  records: RecordIndex
  readText: (recordId: RecordId) => string | undefined
}): SearchTextIndex => {
  const previousTexts = input.previous.texts
  const texts = createMapPatchBuilder(previousTexts)
  const bigrams = createMapPatchBuilder(input.previous.bigrams)
  const trigrams = createMapPatchBuilder(input.previous.trigrams)
  const touchedBigrams = new Set<string>()
  const touchedTrigrams = new Set<string>()
  const removedBigrams = new Map<string, RecordId[]>()
  const addedBigrams = new Map<string, RecordId[]>()
  const removedTrigrams = new Map<string, RecordId[]>()
  const addedTrigrams = new Map<string, RecordId[]>()
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
      touchedKeys: touchedBigrams,
      removedByKey: removedBigrams,
      addedByKey: addedBigrams
    })
    collectPostingDelta({
      previousText,
      nextText,
      recordId,
      size: 3,
      touchedKeys: touchedTrigrams,
      removedByKey: removedTrigrams,
      addedByKey: addedTrigrams
    })
  })

  if (!changed) {
    return input.previous
  }

  touchedBigrams.forEach(key => {
    const nextIds = applyOrderedIdDelta({
      previous: input.previous.bigrams.get(key) ?? EMPTY_RECORD_IDS,
      remove: createRecordIdSet(removedBigrams.get(key)),
      add: addedBigrams.get(key),
      order: input.records.order
    })
    if (nextIds.length) {
      bigrams.set(key, nextIds)
      return
    }

    bigrams.delete(key)
  })

  touchedTrigrams.forEach(key => {
    const nextIds = applyOrderedIdDelta({
      previous: input.previous.trigrams.get(key) ?? EMPTY_RECORD_IDS,
      remove: createRecordIdSet(removedTrigrams.get(key)),
      add: addedTrigrams.get(key),
      order: input.records.order
    })
    if (nextIds.length) {
      trigrams.set(key, nextIds)
      return
    }

    trigrams.delete(key)
  })

  return {
    texts: texts.finish(),
    bigrams: bigrams.finish(),
    trigrams: trigrams.finish()
  }
}

const buildFieldIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  fieldId: FieldId
): SearchTextIndex => {
  const field = resolveSearchField(context, fieldId)
  if (fieldId !== 'title' && !field) {
    return {
      texts: EMPTY_SEARCH_TEXTS,
      bigrams: EMPTY_SEARCH_POSTINGS,
      trigrams: EMPTY_SEARCH_POSTINGS
    }
  }

  return buildTextIndex({
    ids: records.ids,
    readText: recordId => readFieldSearchText({
      records,
      recordId,
      fieldId,
      field
    })
  })
}

const buildAllIndex = (
  context: IndexReadContext,
  records: RecordIndex
): SearchTextIndex => {
  const fields = resolveDefaultSearchFieldIds(context).map(fieldId => ({
    fieldId,
    field: resolveSearchField(context, fieldId)
  }))

  return buildTextIndex({
    ids: records.ids,
    readText: recordId => readCombinedSearchText({
      records,
      recordId,
      fields
    })
  })
}

export const buildSearchIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  demand?: SearchDemand,
  rev = 1
): SearchIndex => {
  const base: SearchIndex = {
    fields: new Map(),
    rev
  }
  const built = ensureSearchIndex(base, context, records, demand)

  return built === base
    ? base
    : {
        ...built,
        rev
      }
}

export const ensureSearchIndex = (
  previous: SearchIndex,
  context: IndexReadContext,
  records: RecordIndex,
  demand?: SearchDemand
): SearchIndex => {
  let nextAll = previous.all

  if (demand?.all && !previous.all) {
    nextAll = buildAllIndex(context, records)
  }

  const ensured = ensureFieldIndexes({
    previous: previous.fields,
    hasField: fieldId => context.fieldIdSet.has(fieldId),
    fieldIds: demand?.fields ?? [],
    build: fieldId => buildFieldIndex(context, records, fieldId)
  })

  if (!previous.all && nextAll) {
    return {
      all: nextAll,
      fields: ensured.fields,
      rev: previous.rev + 1
    }
  }

  return ensured.changed
    ? {
        ...(nextAll ? { all: nextAll } : {}),
        fields: ensured.fields,
        rev: previous.rev + 1
      }
    : previous
}

export const syncSearchIndex = (
  previous: SearchIndex,
  context: IndexDeriveContext,
  records: RecordIndex
): SearchIndex => {
  if (!context.changed) {
    return previous
  }

  const hasLoadedAll = Boolean(previous.all)
  if (!hasLoadedAll && !previous.fields.size) {
    return previous
  }

  const fields = createMapPatchBuilder(previous.fields)
  let nextAll = previous.all

  if (hasLoadedAll && (
    context.schemaFields.size > 0
    || context.touchedRecords === 'all'
  )) {
    nextAll = buildAllIndex(context, records)
  } else if (hasLoadedAll && context.touchedRecords !== 'all' && context.touchedRecords.size) {
    const allFields = resolveDefaultSearchFieldIds(context).map(fieldId => ({
      fieldId,
      field: resolveSearchField(context, fieldId)
    }))
    const next = updateTextIndex({
      previous: previous.all!,
      touchedRecords: context.touchedRecords,
      records,
      readText: recordId => readCombinedSearchText({
        records,
        recordId,
        fields: allFields
      })
    })
    if (next !== previous.all) {
      nextAll = next
    }
  }

  previous.fields.forEach((previousField, fieldId) => {
    const field = resolveSearchField(context, fieldId)
    if (shouldDropFieldIndex(id => context.fieldIdSet.has(id), context, fieldId)) {
      fields.delete(fieldId)
      return
    }

    if (shouldRebuildFieldIndex(context, fieldId)) {
      fields.set(fieldId, buildFieldIndex(context, records, fieldId))
      return
    }

    if (!shouldSyncFieldIndex(context, fieldId)) {
      return
    }

    const nextField = updateTextIndex({
      previous: previousField,
      touchedRecords: context.touchedRecords,
      records,
      readText: recordId => readFieldSearchText({
        records,
        recordId,
        fieldId,
        field
      })
    })

    if (nextField !== previousField) {
      fields.set(fieldId, nextField)
    }
  })

  if (nextAll === previous.all && !fields.changed()) {
    return previous
  }

  return {
    ...(nextAll ? { all: nextAll } : {}),
    fields: fields.finish(),
    rev: previous.rev + 1
  }
}
