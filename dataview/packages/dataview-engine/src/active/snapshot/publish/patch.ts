import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  CustomField,
  Field,
  FieldId
} from '@dataview/core/contracts'
import { equal } from '@shared/core'
import type {
  ActivePatch,
  EntityPatch,
  ItemId,
  Section,
  SectionKey,
  ViewItem,
  ViewState
} from '@dataview/engine/contracts'
import type {
  SnapshotChange
} from '@dataview/engine/contracts/state'

const EMPTY_FIELDS = [] as readonly Field[]
const EMPTY_CUSTOM_FIELDS = [] as readonly CustomField[]
const EMPTY_ITEM_IDS = [] as readonly ItemId[]
const EMPTY_SECTION_KEYS = [] as readonly SectionKey[]

const entityPatch = <TKey, TValue>(input: {
  ids?: readonly TKey[]
  set?: readonly (readonly [TKey, TValue | undefined])[]
  remove?: readonly TKey[]
}): EntityPatch<TKey, TValue> | undefined => (
  input.ids !== undefined || input.set?.length || input.remove?.length
    ? {
        ...(input.ids !== undefined
          ? {
              ids: input.ids
            }
          : {}),
        ...(input.set?.length
          ? {
              set: new Map(input.set)
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

const collectRemovedKeys = <TKey,>(
  previousIds: readonly TKey[],
  nextIds: readonly TKey[]
) => {
  if (!previousIds.length) {
    return [] as TKey[]
  }

  const nextIdSet = new Set(nextIds)
  return previousIds.filter(key => !nextIdSet.has(key))
}

const buildFieldCollectionPatch = <TField extends Field | CustomField>(input: {
  previous?: readonly TField[]
  next: readonly TField[]
}): EntityPatch<FieldId, TField> | undefined => entityPatch({
  ids: input.next.map(field => field.id),
  set: input.next.map(field => [field.id, field] as const),
  remove: input.previous
    ? collectRemovedKeys(
        input.previous.map(field => field.id),
        input.next.map(field => field.id)
      )
    : []
})

const buildItemPatch = (input: {
  previous?: ViewState
  next: ViewState
  changedSections: readonly SectionKey[]
  removedSections: readonly SectionKey[]
  rebuild: boolean
}): EntityPatch<ItemId, ViewItem> | undefined => {
  if (input.rebuild || !input.previous) {
    return entityPatch<ItemId, ViewItem>({
      ids: input.next.items.ids,
      set: input.next.items.ids.map(itemId => [itemId, input.next.items.get(itemId)] as const)
    })
  }

  const set = new Map<ItemId, ViewItem | undefined>()
  const remove = new Set<ItemId>()

  input.removedSections.forEach(sectionKey => {
    input.previous?.sections.get(sectionKey)?.items.ids.forEach(itemId => {
      remove.add(itemId)
    })
  })

  input.changedSections.forEach(sectionKey => {
    const previousItemIds = input.previous?.sections.get(sectionKey)?.items.ids ?? EMPTY_ITEM_IDS
    const nextItemIds = input.next.sections.get(sectionKey)?.items.ids ?? EMPTY_ITEM_IDS
    const previousItemIdSet = new Set(previousItemIds)
    const nextItemIdSet = new Set(nextItemIds)

    previousItemIds.forEach(itemId => {
      if (!nextItemIdSet.has(itemId)) {
        remove.add(itemId)
      }
    })

    nextItemIds.forEach(itemId => {
      const nextItem = input.next.items.get(itemId)
      if (!nextItem) {
        return
      }

      if (
        previousItemIdSet.has(itemId)
        && input.previous?.items.get(itemId) === nextItem
      ) {
        return
      }

      set.set(itemId, nextItem)
    })
  })

  return entityPatch<ItemId, ViewItem>({
    ...(input.previous?.items.ids !== input.next.items.ids
      ? {
          ids: input.next.items.ids
        }
      : {}),
    set: [...set.entries()],
    remove: [...remove]
  })
}

const buildSectionDataPatch = (input: {
  previous?: ViewState
  next: ViewState
  changedSections: readonly SectionKey[]
  removedSections: readonly SectionKey[]
  rebuild: boolean
}): EntityPatch<SectionKey, Section> | undefined => {
  if (input.rebuild || !input.previous) {
    return entityPatch<SectionKey, Section>({
      ids: input.next.sections.ids,
      set: input.next.sections.ids.map(sectionKey => [sectionKey, input.next.sections.get(sectionKey)] as const)
    })
  }

  return entityPatch<SectionKey, Section>({
    ...(input.previous.sections.ids !== input.next.sections.ids
      ? {
          ids: input.next.sections.ids
        }
      : {}),
    set: input.changedSections
      .map(sectionKey => [sectionKey, input.next.sections.get(sectionKey)] as const)
      .filter(([, value]) => value !== undefined),
    remove: input.removedSections
  })
}

const buildSectionSummaryPatch = (input: {
  previous?: ViewState
  next: ViewState
  rebuild: boolean
}): EntityPatch<SectionKey, CalculationCollection | undefined> | undefined => {
  if (input.rebuild || !input.previous) {
    return entityPatch<SectionKey, CalculationCollection | undefined>({
      ids: input.next.sections.ids,
      set: input.next.sections.ids.map(sectionKey => [sectionKey, input.next.summaries.get(sectionKey)] as const)
    })
  }

  const changedSections = input.next.sections.ids.filter(sectionKey => (
    input.previous?.summaries.get(sectionKey) !== input.next.summaries.get(sectionKey)
  ))
  const removedSections = collectRemovedKeys(
    input.previous.sections.ids,
    input.next.sections.ids
  )

  return entityPatch<SectionKey, CalculationCollection | undefined>({
    ...(input.previous.sections.ids !== input.next.sections.ids
      ? {
          ids: input.next.sections.ids
        }
      : {}),
    set: changedSections.map(sectionKey => [sectionKey, input.next.summaries.get(sectionKey)] as const),
    remove: removedSections
  })
}

const projectInactiveActivePatch = (input: {
  previous?: ViewState
}): ActivePatch | undefined => {
  if (!input.previous) {
    return undefined
  }

  const previous = input.previous
  return {
    view: {
      ready: false,
      id: undefined,
      type: undefined,
      value: undefined
    },
    items: entityPatch({
      ids: EMPTY_ITEM_IDS,
      remove: previous.items.ids
    }),
    sections: {
      data: entityPatch({
        ids: EMPTY_SECTION_KEYS,
        remove: previous.sections.ids
      }),
      summary: entityPatch({
        ids: EMPTY_SECTION_KEYS,
        remove: previous.sections.ids
      })
    },
    fields: {
      all: buildFieldCollectionPatch({
        previous: previous.fields.all,
        next: EMPTY_FIELDS
      }),
      custom: buildFieldCollectionPatch({
        previous: previous.fields.custom,
        next: EMPTY_CUSTOM_FIELDS
      })
    }
  }
}

export const buildActivePatch = (input: {
  previous?: ViewState
  next?: ViewState
  change?: SnapshotChange
}): ActivePatch | undefined => {
  if (!input.next) {
    return projectInactiveActivePatch({
      previous: input.previous
    })
  }

  const next = input.next
  const previous = input.previous
  const rebuild = (
    !previous
    || previous.view.id !== next.view.id
    || previous.view.type !== next.view.type
  )
  const sectionChange = input.change?.sections
  const summaryChange = input.change?.summary
  const changedSections = sectionChange
    ? (
        sectionChange.rebuild
          ? next.sections.ids
          : sectionChange.changed
      )
    : previous
      ? collectRemovedKeys(previous.sections.ids, next.sections.ids).length
          || !equal.sameOrder(previous.sections.ids, next.sections.ids)
          ? next.sections.ids
          : next.sections.ids.filter(sectionKey => previous.sections.get(sectionKey) !== next.sections.get(sectionKey))
      : next.sections.ids
  const removedSections = sectionChange
    ? sectionChange.removed
    : previous
      ? collectRemovedKeys(previous.sections.ids, next.sections.ids)
      : []

  const items = buildItemPatch({
    previous,
    next,
    changedSections,
    removedSections,
    rebuild: rebuild || Boolean(sectionChange?.rebuild)
  })
  const sectionData = buildSectionDataPatch({
    previous,
    next,
    changedSections,
    removedSections,
    rebuild: rebuild || Boolean(sectionChange?.rebuild)
  })
  const sectionSummary = buildSectionSummaryPatch({
    previous,
    next,
    rebuild: rebuild || Boolean(summaryChange?.rebuild)
  })
  const fields = rebuild || previous?.fields !== next.fields
    ? {
        all: buildFieldCollectionPatch({
          previous: previous?.fields.all,
          next: next.fields.all
        }),
        custom: buildFieldCollectionPatch({
          previous: previous?.fields.custom,
          next: next.fields.custom
        })
      }
    : undefined

  const active = {
    ...(rebuild || previous?.view !== next.view
      ? {
          view: {
            ready: true,
            id: next.view.id,
            type: next.view.type,
            value: next.view
          }
        }
      : {}),
    ...(() => {
      const meta = {
        ...(rebuild || previous?.query !== next.query
          ? {
              query: next.query
            }
          : {}),
        ...(rebuild || previous?.table !== next.table
          ? {
              table: next.table
            }
          : {}),
        ...(rebuild || previous?.gallery !== next.gallery
          ? {
              gallery: next.gallery
            }
          : {}),
        ...(rebuild || previous?.kanban !== next.kanban
          ? {
              kanban: next.kanban
            }
          : {})
      }

      return Object.keys(meta).length
        ? { meta }
        : {}
    })(),
    ...(items
      ? {
          items
        }
      : {}),
    ...(sectionData || sectionSummary
      ? {
          sections: {
            ...(sectionData
              ? {
                  data: sectionData
                }
              : {}),
            ...(sectionSummary
              ? {
                  summary: sectionSummary
                }
              : {})
          }
        }
      : {}),
    ...(fields?.all || fields?.custom
      ? {
          fields
        }
      : {})
  } satisfies ActivePatch

  return Object.keys(active).length
    ? active
    : undefined
}
