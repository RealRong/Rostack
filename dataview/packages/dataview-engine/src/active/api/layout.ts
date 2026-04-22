import type {
  CustomFieldId,
  CustomFieldKind,
  FieldId
} from '@dataview/core/contracts'
import {
  view as viewApi
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/view'
import type { ActiveViewContext } from '@dataview/engine/active/api/context'
import { createFieldId } from '@dataview/engine/mutate/entityId'

const insertField = (
  base: ActiveViewContext,
  anchorFieldId: FieldId,
  side: 'left' | 'right',
  input?: {
    name?: string
    kind?: CustomFieldKind
  }
): CustomFieldId | undefined => {
  const view = base.view()
  if (!view) {
    return undefined
  }

  const name = input?.name?.trim()
  if (!name) {
    return undefined
  }

  const fieldId = createFieldId()
  const beforeFieldId = viewApi.display.insertBefore(
    view.display.fields,
    anchorFieldId,
    side
  )
  const result = base.dispatch([
    {
      type: 'field.create',
      input: {
        id: fieldId,
        name,
        kind: input?.kind ?? 'text'
      }
    },
    {
      type: 'view.patch',
      viewId: view.id,
      patch: {
        display: viewApi.display.show(view.display, fieldId, beforeFieldId)
      }
    }
  ])

  return result.applied
    ? fieldId
    : undefined
}

export const createDisplayApi = (
  base: ActiveViewContext
): ActiveViewApi['display'] => ({
  replace: fieldIds => {
    base.patchView(() => ({
      display: viewApi.display.replace(fieldIds)
    }))
  },
  move: (fieldIds, beforeFieldId) => {
    base.patchView(view => ({
      display: viewApi.display.move(view.display, fieldIds, beforeFieldId)
    }))
  },
  show: (fieldId, beforeFieldId) => {
    base.patchView(view => ({
      display: viewApi.display.show(view.display, fieldId, beforeFieldId)
    }))
  },
  hide: fieldId => {
    base.patchView(view => ({
      display: viewApi.display.hide(view.display, fieldId)
    }))
  },
  clear: () => {
    base.patchView(() => ({
      display: viewApi.display.clear()
    }))
  }
})

export const createSummaryApi = (
  base: ActiveViewContext
): ActiveViewApi['summary'] => ({
  set: (fieldId, metric) => base.patchView(view => ({
    calc: viewApi.calc.set(view.calc, fieldId, metric)
  }))
})

export const createTableApi = (input: {
  base: ActiveViewContext
}): ActiveViewApi['table'] => ({
  setColumnWidths: widths => input.base.patchView(view => ({
    options: viewApi.layout.table.patch(view.options, {
      widths
    })
  })),
  setVerticalLines: value => input.base.patchView(view => ({
    options: viewApi.layout.table.patch(view.options, {
      showVerticalLines: value
    })
  })),
  setWrap: value => input.base.patchView(view => ({
    options: viewApi.layout.table.patch(view.options, {
      wrap: value
    })
  })),
  insertFieldLeft: (anchorFieldId, fieldInput) => {
    return insertField(input.base, anchorFieldId, 'left', fieldInput)
  },
  insertFieldRight: (anchorFieldId, fieldInput) => {
    return insertField(input.base, anchorFieldId, 'right', fieldInput)
  }
})

export const createGalleryApi = (
  base: ActiveViewContext
): ActiveViewApi['gallery'] => ({
  setWrap: value => base.patchView(view => ({
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        wrap: value
      }
    })
  })),
  setSize: value => base.patchView(view => ({
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        size: value
      }
    })
  })),
  setLayout: value => base.patchView(view => ({
    options: viewApi.layout.gallery.patch(view.options, {
      card: {
        layout: value
      }
    })
  }))
})

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setWrap: value => base.patchView(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        wrap: value
      }
    })
  })),
  setSize: value => base.patchView(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        size: value
      }
    })
  })),
  setLayout: value => base.patchView(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        layout: value
      }
    })
  })),
  setFillColor: value => base.patchView(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      fillColumnColor: value
    })
  })),
  setCardsPerColumn: value => base.patchView(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      cardsPerColumn: value
    })
  }))
})
