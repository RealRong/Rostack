import type { CalculationCollection } from '@dataview/core/calculation'
import { impact as commitImpact } from '@dataview/core/commit/impact'
import { document as documentApi } from '@dataview/core/document'
import type {
  CommitImpact,
  CustomField,
  DataDoc,
  DataRecord,
  Field,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import type {
  ActiveChange,
  ActiveRecordsChange,
  ActiveViewChange,
  DocumentChange,
  EngineChange,
  EntityChange,
  ItemChange,
  ItemValue,
  SectionChange,
  SummaryChange
} from '@dataview/engine/contracts/change'
import type {
  EngineSnapshot
} from '@dataview/engine/contracts/core'
import type {
  ItemId,
  FieldList,
  SectionList,
  Section,
  SectionKey
} from '@dataview/engine/contracts/shared'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

const readTouchedIds = <T,>(
  touched: ReadonlySet<T> | 'all',
  all: readonly T[]
): readonly T[] => touched === 'all'
  ? all
  : [...touched]

const createEntityChange = <TKey, TValue>(input: {
  ids?: readonly TKey[]
  set?: readonly (readonly [TKey, TValue])[]
  remove?: readonly TKey[]
}): EntityChange<TKey, TValue> | undefined => (
  input.ids !== undefined || input.set?.length || input.remove?.length
    ? {
        ...(input.ids !== undefined
          ? {
              ids: input.ids
            }
          : {}),
        ...(input.set?.length
          ? {
              set: input.set
            }
          : {}),
        ...(input.remove?.length
          ? {
              remove: input.remove
            }
          : {})
      }
    : undefined
)

const buildDocumentEntityChange = <TKey, TValue>(input: {
  ids: readonly TKey[]
  idsChanged: boolean
  changed: readonly TKey[]
  removed: readonly TKey[]
  value: (key: TKey) => TValue | undefined
}): EntityChange<TKey, TValue> | undefined => createEntityChange({
  ...(input.idsChanged
    ? {
        ids: input.ids
      }
    : {}),
  set: input.changed.flatMap(key => {
    const value = input.value(key)
    return value === undefined
      ? []
      : [[key, value] as const]
  }),
  remove: input.removed
})

export const projectDocumentChange = (input: {
  impact: CommitImpact
  document: DataDoc
}): DocumentChange | undefined => {
  if (input.impact.reset) {
    return {
      records: buildDocumentEntityChange<RecordId, DataRecord>({
        ids: documentApi.records.ids(input.document),
        idsChanged: true,
        changed: documentApi.records.ids(input.document),
        removed: [],
        value: recordId => documentApi.records.get(input.document, recordId)
      }),
      fields: buildDocumentEntityChange<FieldId, CustomField>({
        ids: documentApi.fields.custom.ids(input.document),
        idsChanged: true,
        changed: documentApi.fields.custom.ids(input.document),
        removed: [],
        value: fieldId => documentApi.fields.custom.get(input.document, fieldId)
      }),
      views: buildDocumentEntityChange<ViewId, View>({
        ids: documentApi.views.ids(input.document),
        idsChanged: true,
        changed: documentApi.views.ids(input.document),
        removed: [],
        value: viewId => documentApi.views.get(input.document, viewId)
      })
    }
  }

  const recordIds = readTouchedIds(
    commitImpact.record.touchedIds(input.impact),
    documentApi.records.ids(input.document)
  )
  const fieldIds = readTouchedIds(
    commitImpact.field.schemaIds(input.impact),
    documentApi.fields.custom.ids(input.document)
  )
  const viewIds = readTouchedIds(
    commitImpact.view.touchedIds(input.impact),
    documentApi.views.ids(input.document)
  )

  const records = buildDocumentEntityChange<RecordId, DataRecord>({
    ids: documentApi.records.ids(input.document),
    idsChanged: Boolean(
      input.impact.records?.inserted?.size
      || input.impact.records?.removed?.size
    ),
    changed: recordIds as readonly RecordId[],
    removed: [...(input.impact.records?.removed ?? [])],
    value: recordId => documentApi.records.get(input.document, recordId)
  })
  const fields = buildDocumentEntityChange<FieldId, CustomField>({
    ids: documentApi.fields.custom.ids(input.document),
    idsChanged: Boolean(
      input.impact.fields?.inserted?.size
      || input.impact.fields?.removed?.size
    ),
    changed: fieldIds as readonly FieldId[],
    removed: [...(input.impact.fields?.removed ?? [])],
    value: fieldId => documentApi.fields.custom.get(input.document, fieldId)
  })
  const views = buildDocumentEntityChange<ViewId, View>({
    ids: documentApi.views.ids(input.document),
    idsChanged: Boolean(
      input.impact.views?.inserted?.size
      || input.impact.views?.removed?.size
    ),
    changed: viewIds as readonly ViewId[],
    removed: [...(input.impact.views?.removed ?? [])],
    value: viewId => documentApi.views.get(input.document, viewId)
  })

  return records || fields || views
    ? {
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
        ...(views
          ? {
              views
            }
          : {})
      }
    : undefined
}

const sameIds = <T,>(
  previous: readonly T[],
  next: readonly T[]
) => equal.sameOrder(previous, next)

const buildKeyedEntityChange = <TKey, TValue>(input: {
  previousIds: readonly TKey[]
  nextIds: readonly TKey[]
  previousGet: (key: TKey) => TValue | undefined
  nextGet: (key: TKey) => TValue | undefined
}): EntityChange<TKey, TValue> | undefined => {
  const nextIdSet = new Set(input.nextIds)
  const set: Array<readonly [TKey, TValue]> = []
  const remove: TKey[] = []

  for (let index = 0; index < input.nextIds.length; index += 1) {
    const key = input.nextIds[index]!
    const nextValue = input.nextGet(key)
    if (nextValue === undefined || input.previousGet(key) === nextValue) {
      continue
    }

    set.push([key, nextValue] as const)
  }

  for (let index = 0; index < input.previousIds.length; index += 1) {
    const key = input.previousIds[index]!
    if (!nextIdSet.has(key)) {
      remove.push(key)
    }
  }

  return createEntityChange({
    ...(sameIds(input.previousIds, input.nextIds)
      ? {}
      : {
          ids: input.nextIds
        }),
    set,
    remove
  })
}

const buildFieldChange = <TField extends Field>(input: {
  previousIds: readonly FieldId[]
  nextIds: readonly FieldId[]
  previousGet: (fieldId: FieldId) => TField | undefined
  nextGet: (fieldId: FieldId) => TField | undefined
}): EntityChange<FieldId, TField> | undefined => buildKeyedEntityChange({
  previousIds: input.previousIds,
  nextIds: input.nextIds,
  previousGet: input.previousGet,
  nextGet: input.nextGet
})

const collectSectionItemIds = (
  sections: SectionList | undefined
): readonly ItemId[] => {
  if (!sections?.all.length) {
    return []
  }

  const ids: ItemId[] = []
  sections.all.forEach(section => {
    section.itemIds.forEach(itemId => {
      ids.push(itemId)
    })
  })
  return ids
}

const readItemValue = (
  snapshot: ViewState | undefined,
  itemId: ItemId
): ItemValue | undefined => {
  if (!snapshot) {
    return undefined
  }

  const record = snapshot.items.read.record(itemId)
  const section = snapshot.items.read.section(itemId)
  const placement = snapshot.items.read.placement(itemId)
  if (!record || !section || !placement) {
    return undefined
  }

  return {
    record,
    section,
    placement
  }
}

const sameItemValue = (
  previous: ItemValue | undefined,
  next: ItemValue | undefined
) => previous?.record === next?.record
  && previous?.section === next?.section
  && previous?.placement === next?.placement

const buildItemChange = (input: {
  previous?: ViewState
  next: ViewState
}): ItemChange | undefined => {
  const previousAllIds = collectSectionItemIds(input.previous?.sections)
  const nextAllIds = collectSectionItemIds(input.next.sections)
  const nextIdSet = new Set(nextAllIds)
  const set: Array<readonly [ItemId, ItemValue]> = []
  const remove: ItemId[] = []

  for (let index = 0; index < nextAllIds.length; index += 1) {
    const itemId = nextAllIds[index]!
    const nextValue = readItemValue(input.next, itemId)
    if (!nextValue) {
      continue
    }

    if (sameItemValue(readItemValue(input.previous, itemId), nextValue)) {
      continue
    }

    set.push([itemId, nextValue] as const)
  }

  for (let index = 0; index < previousAllIds.length; index += 1) {
    const itemId = previousAllIds[index]!
    if (!nextIdSet.has(itemId)) {
      remove.push(itemId)
    }
  }

  return createEntityChange({
    ...(sameIds(input.previous?.items.ids ?? [], input.next.items.ids)
      ? {}
      : {
          ids: input.next.items.ids
        }),
    set,
    remove
  })
}

const buildSectionChange = (input: {
  previous?: ViewState
  next: ViewState
}): SectionChange | undefined => {
  const change = buildKeyedEntityChange<SectionKey, Section>({
    previousIds: input.previous?.sections.ids ?? [],
    nextIds: input.next.sections.ids,
    previousGet: key => input.previous?.sections.get(key),
    nextGet: key => input.next.sections.get(key)
  })

  return change
    ? {
        ...(change.ids
          ? {
              keys: change.ids
            }
          : {}),
        ...(change.set
          ? {
              set: change.set
            }
          : {}),
        ...(change.remove
          ? {
              remove: change.remove
            }
          : {})
      }
    : undefined
}

const buildSummaryChange = (input: {
  previous?: ViewState
  next: ViewState
}): SummaryChange | undefined => {
  const nextKeys = input.next.sections.ids
  const previousKeys = input.previous?.sections.ids ?? []
  const nextKeySet = new Set(nextKeys)
  const set: Array<readonly [SectionKey, CalculationCollection]> = []
  const remove: SectionKey[] = []

  for (let index = 0; index < nextKeys.length; index += 1) {
    const key = nextKeys[index]!
    const nextValue = input.next.summaries.get(key)
    if (!nextValue || input.previous?.summaries.get(key) === nextValue) {
      continue
    }

    set.push([key, nextValue] as const)
  }

  for (let index = 0; index < previousKeys.length; index += 1) {
    const key = previousKeys[index]!
    if (!nextKeySet.has(key)) {
      remove.push(key)
    }
  }

  return set.length || remove.length
    ? {
        ...(set.length
          ? {
              set
            }
          : {}),
        ...(remove.length
          ? {
              remove
            }
          : {})
      }
    : undefined
}

const customFieldIds = (
  fields: FieldList | undefined
): readonly FieldId[] => fields?.custom.length
  ? fields.custom.map(field => field.id)
  : []

const buildActiveViewChange = (input: {
  previous?: ViewState
  next: ViewState
}): ActiveViewChange | undefined => {
  const change: ActiveViewChange = {}

  if (input.previous?.view !== input.next.view) {
    change.current = input.next.view
  }
  if (input.previous?.query !== input.next.query) {
    change.query = input.next.query
  }
  if (input.previous?.table !== input.next.table) {
    change.table = input.next.table
  }
  if (input.previous?.gallery !== input.next.gallery) {
    change.gallery = input.next.gallery
  }
  if (input.previous?.kanban !== input.next.kanban) {
    change.kanban = input.next.kanban
  }

  return Object.keys(change).length
    ? change
    : undefined
}

const buildActiveRecordsChange = (input: {
  previous?: ViewState
  next: ViewState
}): ActiveRecordsChange | undefined => {
  const change: ActiveRecordsChange = {}

  if (input.previous?.records.matched !== input.next.records.matched) {
    change.matched = input.next.records.matched
  }
  if (input.previous?.records.ordered !== input.next.records.ordered) {
    change.ordered = input.next.records.ordered
  }
  if (input.previous?.records.visible !== input.next.records.visible) {
    change.visible = input.next.records.visible
  }

  return Object.keys(change).length
    ? change
    : undefined
}

export const projectActiveChange = (input: {
  previous?: ViewState
  next?: ViewState
}): ActiveChange | undefined => {
  if (!input.previous && !input.next) {
    return undefined
  }

  if (!input.next) {
    return {
      reset: true
    }
  }

  if (
    !input.previous
    || input.previous.view.id !== input.next.view.id
    || input.previous.view.type !== input.next.view.type
  ) {
    return {
      reset: true
    }
  }

  const next = input.next
  const previous = input.previous

  const view = buildActiveViewChange({
    previous,
    next
  })
  const records = buildActiveRecordsChange({
    previous,
    next
  })
  const items = buildItemChange({
    previous,
    next
  })
  const sections = buildSectionChange({
    previous,
    next
  })
  const summaries = buildSummaryChange({
    previous,
    next
  })
  const all = buildFieldChange<Field>({
    previousIds: previous.fields.ids,
    nextIds: next.fields.ids,
    previousGet: fieldId => previous.fields.get(fieldId),
    nextGet: fieldId => next.fields.get(fieldId)
  })
  const custom = buildFieldChange<CustomField>({
    previousIds: customFieldIds(previous.fields),
    nextIds: customFieldIds(next.fields),
    previousGet: fieldId => previous.fields.get(fieldId) as CustomField | undefined,
    nextGet: fieldId => next.fields.get(fieldId) as CustomField | undefined
  })

  return view || records || items || sections || summaries || all || custom
    ? {
        ...(view
          ? {
              view
            }
          : {}),
        ...(records
          ? {
              records
            }
          : {}),
        ...(items
          ? {
              items
            }
          : {}),
        ...(sections
          ? {
              sections
            }
          : {}),
        ...(summaries
          ? {
              summaries
            }
          : {}),
        ...(all || custom
          ? {
              fields: {
                ...(all
                  ? {
                      all
                    }
                  : {}),
                ...(custom
                  ? {
                      custom
                    }
                  : {})
              }
            }
          : {})
      }
    : undefined
}

export const projectEngineChange = (input: {
  previous: EngineSnapshot
  next: EngineSnapshot
  impact: CommitImpact
}): EngineChange | undefined => {
  const doc = projectDocumentChange({
    impact: input.impact,
    document: input.next.doc
  })
  const active = projectActiveChange({
    previous: input.previous.active,
    next: input.next.active
  })

  return doc || active
    ? {
        ...(doc
          ? {
              doc
            }
          : {}),
        ...(active
          ? {
              active
            }
          : {})
      }
    : undefined
}
