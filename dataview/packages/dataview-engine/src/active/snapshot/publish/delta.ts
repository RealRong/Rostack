import type {
  CustomField,
  Field,
  FieldId
} from '@dataview/core/contracts'
import type {
  ActiveDelta,
  CollectionDelta
} from '@dataview/engine/contracts/delta'
import type {
  ItemId,
  SectionKey
} from '@dataview/engine/contracts/shared'
import type {
  SummaryDelta
} from '@dataview/engine/contracts/state'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

const createCollectionDelta = <Key,>(input: {
  list?: boolean
  update?: readonly Key[]
  remove?: readonly Key[]
}): CollectionDelta<Key> | undefined => (
  input.list || input.update?.length || input.remove?.length
    ? {
        ...(input.list
          ? {
              list: true as const
            }
          : {}),
        ...(input.update?.length
          ? {
              update: input.update
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

const buildKeyedCollectionDelta = <Key, Value>(input: {
  previousIds: readonly Key[]
  nextIds: readonly Key[]
  previousGet: (key: Key) => Value | undefined
  nextGet: (key: Key) => Value | undefined
}): CollectionDelta<Key> | undefined => {
  const nextIdSet = new Set(input.nextIds)
  const update: Key[] = []
  const remove: Key[] = []

  for (let index = 0; index < input.nextIds.length; index += 1) {
    const key = input.nextIds[index]!
    const nextValue = input.nextGet(key)
    if (nextValue === undefined || input.previousGet(key) === nextValue) {
      continue
    }

    update.push(key)
  }

  for (let index = 0; index < input.previousIds.length; index += 1) {
    const key = input.previousIds[index]!
    if (!nextIdSet.has(key)) {
      remove.push(key)
    }
  }

  return createCollectionDelta({
    list: input.previousIds !== input.nextIds,
    update,
    remove
  })
}

const customFieldIds = (
  fields: ViewState['fields'] | undefined
): readonly FieldId[] => fields?.custom.length
  ? fields.custom.map(field => field.id)
  : []

const buildSummaryCollectionDelta = (input: {
  previous: ViewState
  next: ViewState
  delta: SummaryDelta
}): CollectionDelta<SectionKey> | undefined => {
  if (input.delta.rebuild) {
    const removed = input.previous.sections.ids.filter(
      sectionKey => !input.next.summaries.has(sectionKey)
    )

    return createCollectionDelta({
      list: input.previous.sections.ids !== input.next.sections.ids,
      update: input.next.sections.ids,
      remove: removed
    })
  }

  return createCollectionDelta({
    list: input.previous.sections.ids !== input.next.sections.ids,
    update: input.delta.changed,
    remove: input.delta.removed
  })
}

export const projectActiveDelta = (input: {
  previous?: ViewState
  next?: ViewState
  sections?: CollectionDelta<SectionKey>
  items?: CollectionDelta<ItemId>
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
  const meta = (
    previous.query !== next.query
    || previous.table !== next.table
    || previous.gallery !== next.gallery
    || previous.kanban !== next.kanban
  )
    ? {
        ...(previous.query !== next.query
          ? {
              query: true as const
            }
          : {}),
        ...(previous.table !== next.table
          ? {
              table: true as const
            }
          : {}),
        ...(previous.gallery !== next.gallery
          ? {
              gallery: true as const
            }
          : {}),
        ...(previous.kanban !== next.kanban
          ? {
              kanban: true as const
            }
          : {})
      }
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
  const all = buildKeyedCollectionDelta<FieldId, Field>({
    previousIds: previous.fields.ids,
    nextIds: next.fields.ids,
    previousGet: fieldId => previous.fields.get(fieldId),
    nextGet: fieldId => next.fields.get(fieldId)
  })
  const custom = buildKeyedCollectionDelta<FieldId, CustomField>({
    previousIds: customFieldIds(previous.fields),
    nextIds: customFieldIds(next.fields),
    previousGet: fieldId => previous.fields.get(fieldId) as CustomField | undefined,
    nextGet: fieldId => next.fields.get(fieldId) as CustomField | undefined
  })
  const summaries = buildSummaryCollectionDelta({
    previous,
    next,
    delta: input.summaries
  })

  return previous.view !== next.view
    || meta
    || records
    || all
    || custom
    || input.sections
    || input.items
    || summaries
    ? {
        ...(previous.view !== next.view
          ? {
              view: true as const
            }
          : {}),
        ...(meta
          ? {
              meta
            }
          : {}),
        ...(records
          ? {
              records
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
