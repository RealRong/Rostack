import type {
  CommitDelta,
  DataDoc
} from '@dataview/core/contracts'
import type {
  IndexStageTrace,
  IndexTrace
} from '../types'
import {
  buildCalculationIndex,
  syncCalculationIndex
} from './calculations'
import {
  buildGroupIndex,
  syncGroupIndex
} from './group'
import {
  buildRecordIndex,
  syncRecordIndex
} from './records'
import {
  buildSearchIndex,
  syncSearchIndex
} from './search'
import {
  buildSortIndex,
  syncSortIndex
} from './sort'
import type {
  IndexState
} from './types'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds
} from './shared'
import {
  now
} from '../perf/shared'

export interface EngineIndex {
  state: () => IndexState
  sync: (document: DataDoc, delta: CommitDelta) => IndexSyncResult
}

export interface IndexSyncResult {
  state: IndexState
  trace?: IndexTrace
}

const fullRebuildFrom = (
  delta: CommitDelta
) => (
  delta.entities.records?.update === 'all'
  || delta.entities.fields?.update === 'all'
  || delta.entities.values?.records === 'all'
  || delta.entities.values?.fields === 'all'
)

const touchedRecordCountOf = (
  delta: CommitDelta
): number | 'all' | undefined => {
  const touched = collectTouchedRecordIds(delta)
  return touched === 'all'
    ? 'all'
    : touched.size || undefined
}

const touchedFieldCountOf = (
  delta: CommitDelta
): number | 'all' | undefined => {
  if (
    delta.entities.fields?.update === 'all'
    || delta.entities.values?.fields === 'all'
  ) {
    return 'all'
  }

  const touched = new Set([
    ...collectSchemaFieldIds(delta),
    ...collectValueFieldIds(delta, { includeTitlePatch: true })
  ])
  return touched.size || undefined
}

const createIndexStageTrace = (input: {
  previous: unknown
  next: unknown
  rebuild: boolean
  durationMs: number
  inputSize?: number
  outputSize?: number
  touchedRecordCount?: number | 'all'
  touchedFieldCount?: number | 'all'
}): IndexStageTrace => ({
  action: input.previous === input.next
    ? 'reuse'
    : input.rebuild
      ? 'rebuild'
      : 'sync',
  changed: input.previous !== input.next,
  ...(input.inputSize === undefined ? {} : { inputSize: input.inputSize }),
  ...(input.outputSize === undefined ? {} : { outputSize: input.outputSize }),
  ...(input.touchedRecordCount === undefined ? {} : { touchedRecordCount: input.touchedRecordCount }),
  ...(input.touchedFieldCount === undefined ? {} : { touchedFieldCount: input.touchedFieldCount }),
  durationMs: input.durationMs
})

const buildIndexState = (
  document: DataDoc
): IndexState => {
  const records = buildRecordIndex(document)
  const group = buildGroupIndex(document, records)

  return {
    records,
    search: buildSearchIndex(document, records),
    group,
    sort: buildSortIndex(document, records),
    calculations: buildCalculationIndex(document, records, group)
  }
}

export const createEngineIndex = (
  document: DataDoc
): EngineIndex => {
  let current = buildIndexState(document)

  return {
    state: () => current,
    sync: (nextDocument, delta) => {
      const previous = current
      const totalStart = now()
      const touchedRecordCount = touchedRecordCountOf(delta)
      const touchedFieldCount = touchedFieldCountOf(delta)
      const rebuild = fullRebuildFrom(delta)

      const recordsStart = now()
      const records = syncRecordIndex(previous.records, nextDocument, delta)
      const recordsMs = now() - recordsStart

      const groupStart = now()
      const group = syncGroupIndex(previous.group, nextDocument, records, delta)
      const groupMs = now() - groupStart

      const searchStart = now()
      const search = syncSearchIndex(previous.search, nextDocument, records, delta)
      const searchMs = now() - searchStart

      const sortStart = now()
      const sort = syncSortIndex(previous.sort, nextDocument, records, delta)
      const sortMs = now() - sortStart

      const calculationsStart = now()
      const calculations = syncCalculationIndex(previous.calculations, nextDocument, records, group, delta)
      const calculationsMs = now() - calculationsStart

      current = {
        records,
        search,
        group,
        sort,
        calculations
      }

      return {
        state: current,
        trace: {
          changed: (
            records !== previous.records
            || search !== previous.search
            || group !== previous.group
            || sort !== previous.sort
            || calculations !== previous.calculations
          ),
          timings: {
            totalMs: now() - totalStart,
            recordsMs,
            searchMs,
            groupMs,
            sortMs,
            calculationsMs
          },
          records: createIndexStageTrace({
            previous: previous.records,
            next: records,
            rebuild,
            durationMs: recordsMs,
            inputSize: previous.records.ids.length,
            outputSize: records.ids.length,
            touchedRecordCount,
            touchedFieldCount
          }),
          search: createIndexStageTrace({
            previous: previous.search,
            next: search,
            rebuild,
            durationMs: searchMs,
            inputSize: previous.search.records.size,
            outputSize: search.records.size,
            touchedRecordCount,
            touchedFieldCount
          }),
          group: createIndexStageTrace({
            previous: previous.group,
            next: group,
            rebuild,
            durationMs: groupMs,
            inputSize: previous.group.fields.size,
            outputSize: group.fields.size,
            touchedRecordCount,
            touchedFieldCount
          }),
          sort: createIndexStageTrace({
            previous: previous.sort,
            next: sort,
            rebuild,
            durationMs: sortMs,
            inputSize: previous.sort.fields.size,
            outputSize: sort.fields.size,
            touchedRecordCount,
            touchedFieldCount
          }),
          calculations: createIndexStageTrace({
            previous: previous.calculations,
            next: calculations,
            rebuild,
            durationMs: calculationsMs,
            inputSize: previous.calculations.fields.size,
            outputSize: calculations.fields.size,
            touchedRecordCount,
            touchedFieldCount
          })
        }
      }
    }
  }
}
