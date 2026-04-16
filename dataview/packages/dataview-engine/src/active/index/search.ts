import {
  buildRecordDefaultSearchTextFromFields,
  buildRecordFieldSearchTextFromField,
  isDefaultSearchField
} from '@dataview/core/search'
import type {
  CustomField,
  FieldId,
  RecordId
} from '@dataview/core/contracts'
import { createMapPatchBuilder } from '@dataview/engine/active/shared/patch'
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

const resolveSearchField = (
  context: Pick<IndexReadContext, 'reader'>,
  fieldId: FieldId
) => fieldId === 'title'
  ? undefined
  : context.reader.fields.get(fieldId)

const resolveDefaultSearchFields = (
  context: Pick<IndexReadContext, 'document' | 'reader'>
): readonly CustomField[] => {
  const fields: CustomField[] = []

  for (let index = 0; index < context.document.fields.order.length; index += 1) {
    const fieldId = context.document.fields.order[index]!
    const field = context.reader.fields.get(fieldId)
    if (field && field.kind !== 'title' && isDefaultSearchField(field)) {
      fields.push(field)
    }
  }

  return fields
}

const buildTextIndex = (input: {
  ids: readonly RecordId[]
  readText: (recordId: RecordId) => string | undefined
}): SearchTextIndex => {
  const texts = new Map<RecordId, string>()

  for (let index = 0; index < input.ids.length; index += 1) {
    const recordId = input.ids[index]!
    const text = input.readText(recordId)
    if (text) {
      texts.set(recordId, text)
    }
  }

  return {
    texts
  }
}

const updateTextIndex = (input: {
  previous: SearchTextIndex
  touchedRecords: ReadonlySet<RecordId>
  readText: (recordId: RecordId) => string | undefined
}): SearchTextIndex => {
  const previous = input.previous.texts
  const texts = createMapPatchBuilder(previous)

  for (const recordId of input.touchedRecords) {
    const previousHas = previous.has(recordId)
    const previousText = previous.get(recordId)
    const nextText = input.readText(recordId)
    const nextHas = Boolean(nextText)

    if (previousHas === nextHas && previousText === nextText) {
      continue
    }

    if (nextText) {
      texts.set(recordId, nextText)
      continue
    }

    texts.delete(recordId)
  }

  return texts.changed()
    ? {
        texts: texts.finish()
      }
    : input.previous
}

const buildFieldIndex = (
  context: IndexReadContext,
  records: RecordIndex,
  fieldId: FieldId
): SearchTextIndex => {
  const field = resolveSearchField(context, fieldId)
  if (fieldId !== 'title' && !field) {
    return {
      texts: EMPTY_SEARCH_TEXTS
    }
  }

  return buildTextIndex({
    ids: records.ids,
    readText: recordId => {
      const record = records.byId[recordId]
      return record
        ? buildRecordFieldSearchTextFromField(record, fieldId, field)
        : undefined
    }
  })
}

const buildAllIndex = (
  context: IndexReadContext,
  records: RecordIndex
): SearchTextIndex => {
  const fields = resolveDefaultSearchFields(context)

  return buildTextIndex({
    ids: records.ids,
    readText: recordId => {
      const record = records.byId[recordId]
      return record
        ? buildRecordDefaultSearchTextFromFields(record, fields)
        : undefined
    }
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
    const defaultFields = resolveDefaultSearchFields(context)
    const next = updateTextIndex({
      previous: previous.all!,
      touchedRecords: context.touchedRecords,
      readText: recordId => {
        const record = records.byId[recordId]
        return record
          ? buildRecordDefaultSearchTextFromFields(record, defaultFields)
          : undefined
      }
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
      readText: recordId => {
        const record = records.byId[recordId]
        return record
          ? buildRecordFieldSearchTextFromField(record, fieldId, field)
          : undefined
      }
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
