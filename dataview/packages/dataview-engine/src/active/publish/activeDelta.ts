import type {
  CustomFieldId,
  FieldId,
  Field
} from '@dataview/core/types'
import {
  activeChange,
  type ActiveDelta
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

type IdPatch<TId = unknown> = {
  set?: readonly TId[]
  remove?: readonly TId[]
  order?: true | readonly TId[]
}

type ActivePatchKey =
  | 'fields'
  | 'sections'
  | 'items'
  | 'summaries'

type ActivePatchIdByKey = {
  fields: FieldId
  sections: SectionId
  items: ItemId
  summaries: SectionId
}

type ActivePatchInput = {
  [TKey in ActivePatchKey]: {
    key: TKey
    patch: IdPatch<ActivePatchIdByKey[TKey]> | undefined
    nextIds: readonly ActivePatchIdByKey[TKey][]
  }
}[ActivePatchKey]

const planPatch = <TId,>(input: {
  patch: IdPatch<TId> | undefined
  nextIds: readonly TId[]
}) => {
  const update: TId[] = []
  const remove: TId[] = []

  if (!input.patch) {
    return {
      update,
      remove
    }
  }

  if (input.patch.order) {
    input.nextIds.forEach(id => {
      update.push(id)
    })
  }

  input.patch.set?.forEach(id => {
    update.push(id)
  })

  input.patch.remove?.forEach(id => {
    remove.push(id)
  })

  return {
    update,
    remove
  }
}

const writePatch = (
  delta: ActiveDelta,
  input: ActivePatchInput
): void => {
  switch (input.key) {
    case 'fields': {
      const planned = planPatch(input)
      planned.update.forEach((id) => {
        activeChange.ids.update(delta, 'fields', id)
      })
      planned.remove.forEach((id) => {
        activeChange.ids.remove(delta, 'fields', id)
      })
      return
    }
    case 'sections': {
      const planned = planPatch(input)
      planned.update.forEach((id) => {
        activeChange.ids.update(delta, 'sections', id)
      })
      planned.remove.forEach((id) => {
        activeChange.ids.remove(delta, 'sections', id)
      })
      return
    }
    case 'items': {
      const planned = planPatch(input)
      planned.update.forEach((id) => {
        activeChange.ids.update(delta, 'items', id)
      })
      planned.remove.forEach((id) => {
        activeChange.ids.remove(delta, 'items', id)
      })
      return
    }
    case 'summaries': {
      const planned = planPatch(input)
      planned.update.forEach((id) => {
        activeChange.ids.update(delta, 'summaries', id)
      })
      planned.remove.forEach((id) => {
        activeChange.ids.remove(delta, 'summaries', id)
      })
      return
    }
  }
}

const writeFieldChanges = (
  delta: ActiveDelta,
  previous: ViewState,
  next: ViewState
): void => {
  const previousSet = new Set(previous.fields.ids)

  next.fields.ids.forEach(fieldId => {
    const previousField = previous.fields.get(fieldId)
    const nextField = next.fields.get(fieldId)

    if (!previousSet.has(fieldId)) {
      activeChange.ids.add(delta, 'fields', fieldId)
      return
    }

    if (previousField !== nextField) {
      activeChange.ids.update(delta, 'fields', fieldId)
    }
  })

  previous.fields.ids.forEach(fieldId => {
    if (!next.fields.get(fieldId)) {
      activeChange.ids.remove(delta, 'fields', fieldId)
    }
  })
}

const writeSummaryChanges = (
  delta: ActiveDelta,
  input: {
    previous: ViewState
    next: ViewState
    summaryDelta: SummaryPhaseDelta
  }
): void => {
  if (input.summaryDelta.rebuild) {
    const nextSections = new Set(input.next.sections.ids)
    input.next.sections.ids.forEach(sectionId => {
      activeChange.ids.update(delta, 'summaries', sectionId)
    })
    input.previous.sections.ids.forEach(sectionId => {
      if (!nextSections.has(sectionId)) {
        activeChange.ids.remove(delta, 'summaries', sectionId)
      }
    })
    return
  }

  input.summaryDelta.changed.forEach(sectionId => {
    activeChange.ids.update(delta, 'summaries', sectionId)
  })
  input.summaryDelta.removed.forEach(sectionId => {
    activeChange.ids.remove(delta, 'summaries', sectionId)
  })
}

export const projectActiveDelta = (input: {
  previous?: ViewState
  next?: ViewState
  sections?: IdPatch<SectionId>
  items?: IdPatch<ItemId>
  summaries: SummaryPhaseDelta
}): ActiveDelta | undefined => {
  if (!input.previous && !input.next) {
    return undefined
  }

  const delta = activeChange.create()

  if (
    !input.next
    || !input.previous
    || input.previous.view.id !== input.next.view.id
    || input.previous.view.type !== input.next.view.type
  ) {
    activeChange.flag(delta, 'reset')
    return activeChange.take(delta)
  }

  const previous = input.previous
  const next = input.next

  if (previous.view !== next.view) {
    activeChange.flag(delta, 'view')
  }
  if (previous.query !== next.query) {
    activeChange.flag(delta, 'query')
  }
  if (previous.table !== next.table) {
    activeChange.flag(delta, 'table')
  }
  if (previous.gallery !== next.gallery) {
    activeChange.flag(delta, 'gallery')
  }
  if (previous.kanban !== next.kanban) {
    activeChange.flag(delta, 'kanban')
  }

  if (previous.records.matched !== next.records.matched) {
    activeChange.flag(delta, 'records.matched')
  }
  if (previous.records.ordered !== next.records.ordered) {
    activeChange.flag(delta, 'records.ordered')
  }
  if (previous.records.visible !== next.records.visible) {
    activeChange.flag(delta, 'records.visible')
  }

  writeFieldChanges(delta, previous, next)
  writePatch(delta, {
    key: 'sections',
    patch: input.sections,
    nextIds: next.sections.ids
  })
  writePatch(delta, {
    key: 'items',
    patch: input.items,
    nextIds: next.items.ids
  })
  writeSummaryChanges(delta, {
    previous,
    next,
    summaryDelta: input.summaries
  })

  return activeChange.has(delta)
    ? activeChange.take(delta)
    : undefined
}
