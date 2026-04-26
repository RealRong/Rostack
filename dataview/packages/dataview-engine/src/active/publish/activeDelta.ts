import type {
  CustomFieldId,
  Field
} from '@dataview/core/contracts'
import {
  entityDelta,
  type EntityDelta
} from '@shared/delta'
import type {
  ActiveDelta
} from '@dataview/engine/contracts/delta'
import type {
  ItemId,
  SectionId
} from '@dataview/engine/contracts/shared'
import type {
  SummaryPhaseDelta
} from '@dataview/engine/active/state'
import type {
  ViewState
} from '@dataview/engine/contracts/view'

const buildSummaryEntityDelta = (input: {
  previous: ViewState
  next: ViewState
  delta: SummaryPhaseDelta
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
  summaries: SummaryPhaseDelta
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
  const fields = entityDelta.fromSnapshots<CustomFieldId, Field>({
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
          ? { query }
          : {}),
        ...(table
          ? { table }
          : {}),
        ...(gallery
          ? { gallery }
          : {}),
        ...(kanban
          ? { kanban }
          : {}),
        ...(records
          ? { records }
          : {}),
        ...(fields
          ? { fields }
          : {}),
        ...(input.sections
          ? { sections: input.sections }
          : {}),
        ...(input.items
          ? { items: input.items }
          : {}),
        ...(summaries
          ? { summaries }
          : {})
      }
    : undefined
}
