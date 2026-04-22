import type { CalculationCollection } from '@dataview/core/calculation'
import { collection, store } from '@shared/core'
import type {
  ActiveSource
} from '@dataview/runtime/source'
import type {
  FieldList,
  ItemList,
  Section,
  SectionKey,
  SectionList,
  ViewRecords,
  ViewState,
  ViewSummaries
} from '@dataview/engine'

const buildRecords = (input: {
  previous?: ViewRecords
  matched: readonly string[]
  ordered: readonly string[]
  visible: readonly string[]
}): ViewRecords => (
  input.previous
  && input.previous.matched === input.matched
  && input.previous.ordered === input.ordered
  && input.previous.visible === input.visible
    ? input.previous
    : {
        matched: input.matched,
        ordered: input.ordered,
        visible: input.visible
      }
)

const buildItems = (input: {
  previous?: ItemList
  ids: readonly number[]
  source: ActiveSource['items']
}): ItemList => (
  input.previous?.ids === input.ids
    ? input.previous
    : {
        ids: input.ids,
        count: input.ids.length,
        order: collection.createOrderedAccess(input.ids),
        read: {
          record: itemId => input.source.read.record.get(itemId),
          section: itemId => input.source.read.section.get(itemId),
          placement: itemId => input.source.read.placement.get(itemId)
        }
      }
)

const buildFields = (input: {
  previous?: FieldList
  source: ActiveSource['fields']
}): FieldList => {
  const ids = input.source.all.ids.get()
  const customIds = input.source.custom.ids.get()
  const canReuse = Boolean(
    input.previous
    && input.previous.ids === ids
    && ids.every(fieldId => input.previous!.get(fieldId) === input.source.all.get(fieldId))
    && input.previous.custom.length === customIds.length
    && customIds.every((fieldId, index) => (
      input.previous!.custom[index] === input.source.custom.get(fieldId)
    ))
  )
  if (canReuse) {
    return input.previous as FieldList
  }

  const all = ids.flatMap(fieldId => {
    const field = input.source.all.get(fieldId)
    return field
      ? [field]
      : []
  })
  const byId = new Map(all.map(field => [field.id, field] as const))
  const custom = customIds.flatMap(fieldId => {
    const field = input.source.custom.get(fieldId)
    return field
      ? [field]
      : []
  })

  return {
    ...collection.createOrderedKeyedCollection({
      ids,
      all,
      get: fieldId => byId.get(fieldId)
    }),
    custom
  }
}

const buildSections = (input: {
  previous?: SectionList
  source: ActiveSource['sections']
}): SectionList => {
  const ids = input.source.keys.get()
  const canReuse = Boolean(
    input.previous
    && input.previous.ids === ids
    && ids.every(sectionKey => input.previous!.get(sectionKey) === input.source.get(sectionKey))
  )
  if (canReuse) {
    return input.previous as SectionList
  }

  const all = ids.flatMap(sectionKey => {
    const section = input.source.get(sectionKey)
    return section
      ? [section]
      : []
  })
  const byKey = new Map<SectionKey, Section>(all.map(section => [section.key, section] as const))

  return collection.createOrderedKeyedCollection({
    ids,
    all,
    get: sectionKey => byKey.get(sectionKey)
  })
}

const buildSummaries = (input: {
  previous?: ViewSummaries
  sectionKeys: readonly SectionKey[]
  source: ActiveSource['summaries']
}): ViewSummaries => {
  const previousKeys = input.previous
    ? [...input.previous.keys()]
    : undefined
  const canReuse = Boolean(
    input.previous
    && input.previous.size === input.sectionKeys.length
    && previousKeys
    && previousKeys.every((sectionKey, index) => (
      sectionKey === input.sectionKeys[index]
      && input.previous!.get(sectionKey) === input.source.get(sectionKey)
    ))
  )
  if (canReuse) {
    return input.previous as ViewSummaries
  }

  const next = new Map<SectionKey, CalculationCollection>()
  input.sectionKeys.forEach(sectionKey => {
    const summary = input.source.get(sectionKey)
    if (summary) {
      next.set(sectionKey, summary)
    }
  })
  return next
}

export const createTableCurrentViewStore = (
  active: ActiveSource
): store.ReadStore<ViewState | undefined> => {
  let previous: ViewState | undefined

  return store.createDerivedStore<ViewState | undefined>({
    get: () => {
      const view = store.read(active.view.current)
      if (!view) {
        previous = undefined
        return undefined
      }

      const sections = buildSections({
        previous: previous?.sections,
        source: active.sections
      })
      const next = {
        view,
        query: store.read(active.meta.query),
        records: buildRecords({
          previous: previous?.records,
          matched: store.read(active.records.matched),
          ordered: store.read(active.records.ordered),
          visible: store.read(active.records.visible)
        }),
        sections,
        items: buildItems({
          previous: previous?.items,
          ids: store.read(active.items.ids),
          source: active.items
        }),
        fields: buildFields({
          previous: previous?.fields,
          source: active.fields
        }),
        table: store.read(active.meta.table),
        gallery: store.read(active.meta.gallery),
        kanban: store.read(active.meta.kanban),
        summaries: buildSummaries({
          previous: previous?.summaries,
          sectionKeys: sections.ids,
          source: active.summaries
        })
      } satisfies ViewState

      if (
        previous
        && previous.view === next.view
        && previous.query === next.query
        && previous.records === next.records
        && previous.sections === next.sections
        && previous.items === next.items
        && previous.fields === next.fields
        && previous.table === next.table
        && previous.gallery === next.gallery
        && previous.kanban === next.kanban
        && previous.summaries === next.summaries
      ) {
        return previous
      }

      previous = next
      return next
    },
    isEqual: Object.is
  })
}
