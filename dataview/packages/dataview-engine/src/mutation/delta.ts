import { document as documentApi } from '@dataview/core/document'
import type {
  CustomFieldId,
  DataDoc,
  Field,
  FieldId,
  RecordId,
  ValueRef,
  ViewId
} from '@dataview/core/contracts'
import type {
  DataviewTrace
} from '@dataview/core/mutation'
import {
  dataviewTrace
} from '@dataview/core/mutation'
import {
  entityDelta,
  type EntityDelta
} from '@shared/projector/delta'
import { equal } from '@shared/core'
import type {
  ActiveDelta,
  DocumentDelta
} from '@dataview/engine/contracts/delta'
import type {
  ItemId,
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  SummaryPhaseDelta as SummaryDelta
} from '@dataview/engine/active/state'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

const readTouchedIds = <T,>(
  touched: ReadonlySet<T> | 'all',
  all: readonly T[]
): readonly T[] => touched === 'all'
  ? all
  : [...touched]

const buildEntityDelta = <Key>(input: {
  previousIds: readonly Key[]
  nextIds: readonly Key[]
  touched?: readonly Key[]
  removed?: readonly Key[]
}): EntityDelta<Key> | undefined => entityDelta.normalize({
  ...(equal.sameOrder(input.previousIds, input.nextIds)
    ? {}
    : {
        order: true as const
      }),
  set: input.touched,
  remove: input.removed
})

const valueRefKey = (
  ref: ValueRef
): string => `${ref.recordId}\u0000${ref.fieldId}`

const collectRecordValueRefs = (
  document: DataDoc,
  recordId: RecordId
): readonly ValueRef[] => {
  const record = documentApi.records.get(document, recordId)
  return record
    ? documentApi.values.fieldIds(record).map(fieldId => ({
        recordId,
        fieldId
      }))
    : []
}

const collectAllValueRefs = (
  document: DataDoc
): readonly ValueRef[] => documentApi.records.ids(document).flatMap((recordId) => (
  collectRecordValueRefs(document, recordId)
))

const buildValueDelta = (input: {
  previous: DataDoc
  next: DataDoc
  trace: DataviewTrace
}): EntityDelta<ValueRef> | undefined => {
  const changes = new Map<string, {
    ref: ValueRef
    kind: 'set' | 'remove'
  }>()
  const setChange = (
    ref: ValueRef,
    kind: 'set' | 'remove'
  ) => {
    changes.set(valueRefKey(ref), {
      ref,
      kind
    })
  }

  const touched = dataviewTrace.value.touched(input.trace)
  if (touched === 'all') {
    const nextRefs = collectAllValueRefs(input.next)
    const nextRefKeySet = new Set(nextRefs.map(valueRefKey))

    nextRefs.forEach((ref) => {
      setChange(ref, 'set')
    })
    collectAllValueRefs(input.previous).forEach((ref) => {
      if (!nextRefKeySet.has(valueRefKey(ref))) {
        setChange(ref, 'remove')
      }
    })
  } else {
    touched?.forEach((fieldIds, recordId) => {
      fieldIds.forEach((fieldId) => {
        const ref: ValueRef = {
          recordId,
          fieldId
        }
        const nextRecord = documentApi.records.get(input.next, recordId)
        const previousRecord = documentApi.records.get(input.previous, recordId)
        const nextValue = nextRecord
          ? documentApi.values.get(nextRecord, fieldId)
          : undefined
        const previousValue = previousRecord
          ? documentApi.values.get(previousRecord, fieldId)
          : undefined

        if (nextValue !== undefined) {
          setChange(ref, 'set')
          return
        }

        if (previousValue !== undefined) {
          setChange(ref, 'remove')
        }
      })
    })
  }

  input.trace.records?.removed?.forEach((recordId) => {
    collectRecordValueRefs(input.previous, recordId).forEach((ref) => {
      setChange(ref, 'remove')
    })
  })
  input.trace.fields?.removed?.forEach((fieldId) => {
    documentApi.records.ids(input.previous).forEach((recordId) => {
      const record = documentApi.records.get(input.previous, recordId)
      if (!record) {
        return
      }

      if (documentApi.values.get(record, fieldId) === undefined) {
        return
      }

      setChange({
        recordId,
        fieldId
      }, 'remove')
    })
  })

  if (!changes.size) {
    return undefined
  }

  const set: ValueRef[] = []
  const remove: ValueRef[] = []
  changes.forEach((change) => {
    if (change.kind === 'set') {
      set.push(change.ref)
      return
    }

    remove.push(change.ref)
  })

  return entityDelta.normalize({
    set,
    remove
  })
}

export const projectDocumentDelta = (input: {
  previous: DataDoc
  next: DataDoc
  trace: DataviewTrace
}): DocumentDelta | undefined => {
  if (input.trace.reset) {
    return {
      reset: true
    }
  }

  const nextRecordIds = documentApi.records.ids(input.next)
  const nextFieldIds = documentApi.fields.ids(input.next)
  const nextSchemaFieldIds = documentApi.schema.fields.ids(input.next)
  const nextViewIds = documentApi.views.ids(input.next)
  const records = buildEntityDelta<RecordId>({
    previousIds: documentApi.records.ids(input.previous),
    nextIds: nextRecordIds,
    touched: readTouchedIds(
      dataviewTrace.record.touchedIds(input.trace),
      nextRecordIds
    ) as readonly RecordId[],
    removed: [...(input.trace.records?.removed ?? [])]
  })
  const values = buildValueDelta(input)
  const fields = buildEntityDelta<FieldId>({
    previousIds: documentApi.fields.ids(input.previous),
    nextIds: nextFieldIds,
    touched: readTouchedIds(
      dataviewTrace.field.touchedIds(input.trace),
      nextFieldIds
    ) as readonly FieldId[],
    removed: [...(input.trace.fields?.removed ?? [])]
  })
  const schemaFields = buildEntityDelta<CustomFieldId>({
    previousIds: documentApi.schema.fields.ids(input.previous),
    nextIds: nextSchemaFieldIds,
    touched: readTouchedIds(
      dataviewTrace.field.schemaIds(input.trace),
      nextSchemaFieldIds
    ) as readonly CustomFieldId[],
    removed: [...(input.trace.fields?.removed ?? [])]
  })
  const views = buildEntityDelta<ViewId>({
    previousIds: documentApi.views.ids(input.previous),
    nextIds: nextViewIds,
    touched: readTouchedIds(
      dataviewTrace.view.touchedIds(input.trace),
      nextViewIds
    ) as readonly ViewId[],
    removed: [...(input.trace.views?.removed ?? [])]
  })
  const meta = !equal.sameJsonValue(input.previous.meta, input.next.meta)
    ? true
    : undefined

  return meta || records || values || fields || schemaFields || views
    ? {
        ...(meta
          ? { meta }
          : {}),
        ...(records
          ? { records }
          : {}),
        ...(values
          ? { values }
          : {}),
        ...(fields
          ? { fields }
          : {}),
        ...(schemaFields
          ? { schemaFields }
          : {}),
        ...(views
          ? { views }
          : {})
      }
    : undefined
}

const buildSummaryEntityDelta = (input: {
  previous: ViewState
  next: ViewState
  delta: SummaryDelta
}): EntityDelta<SectionId> | undefined => {
  if (input.delta.rebuild) {
    const removed = input.previous.sections.ids.filter(
      (sectionId) => !input.next.summaries.has(sectionId)
    )

    return entityDelta.normalize({
      ...(input.previous.sections.ids === input.next.sections.ids
        ? {}
        : {
            order: true as const
          }),
      set: input.next.sections.ids,
      remove: removed
    })
  }

  return entityDelta.normalize({
    ...(input.previous.sections.ids === input.next.sections.ids
      ? {}
      : {
          order: true as const
        }),
    set: input.delta.changed,
    remove: input.delta.removed
  })
}

export const projectActiveDelta = (input: {
  previous?: ViewState
  next?: ViewState
  sections?: EntityDelta<SectionId>
  items?: EntityDelta<ItemId>
  summaries: SummaryDelta
}): ActiveDelta | undefined => {
  if (!input.previous && !input.next) {
    return undefined
  }

  if (
    !input.next
    || !input.previous
    || input.previous.view.id !== input.next.view.id
    || input.previous.view.type !== input.next.view.type
  ) {
    return {
      reset: true
    }
  }

  const previous = input.previous
  const next = input.next
  const query = previous.query !== next.query
    ? true as const
    : undefined
  const table = previous.table !== next.table
    ? true as const
    : undefined
  const gallery = previous.gallery !== next.gallery
    ? true as const
    : undefined
  const kanban = previous.kanban !== next.kanban
    ? true as const
    : undefined
  const records = (
    previous.records.matched !== next.records.matched
    || previous.records.ordered !== next.records.ordered
    || previous.records.visible !== next.records.visible
  )
    ? {
        ...(previous.records.matched !== next.records.matched
          ? {
              matched: true as const
            }
          : {}),
        ...(previous.records.ordered !== next.records.ordered
          ? {
              ordered: true as const
            }
          : {}),
        ...(previous.records.visible !== next.records.visible
          ? {
              visible: true as const
            }
          : {})
      }
    : undefined
  const fields = entityDelta.fromSnapshots<FieldId, Field>({
    previousIds: previous.fields.ids,
    nextIds: next.fields.ids,
    previousGet: (fieldId) => previous.fields.get(fieldId),
    nextGet: (fieldId) => next.fields.get(fieldId)
  })
  const summaries = buildSummaryEntityDelta({
    previous,
    next,
    delta: input.summaries
  })

  return previous.view !== next.view
    || query
    || table
    || gallery
    || kanban
    || records
    || fields
    || input.sections
    || input.items
    || summaries
    ? {
        ...(previous.view !== next.view
          ? {
              view: true as const
            }
          : {}),
        ...(query
          ? {
              query
            }
          : {}),
        ...(table
          ? {
              table
            }
          : {}),
        ...(gallery
          ? {
              gallery
            }
          : {}),
        ...(kanban
          ? {
              kanban
            }
          : {}),
        ...(records
          ? {
              records
            }
          : {}),
        ...(fields
          ? {
              fields
            }
          : {}),
        ...(input.sections
          ? {
              sections: input.sections
            }
          : {}),
        ...(input.items
          ? {
              items: input.items
            }
          : {}),
        ...(summaries
          ? {
              summaries
            }
          : {})
      }
    : undefined
}
