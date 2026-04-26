import type {
  CustomFieldId,
  CustomFieldKind,
  FieldId,
  Intent as CoreIntent
} from '@dataview/core/contracts'
import {
  id as dataviewId
} from '@dataview/core/id'
import {
  view as viewApi
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/view'
import type { ActiveViewContext } from '@dataview/engine/active/api/context'
const insertField = (
  base: ActiveViewContext,
  input: {
    anchor: FieldId
    side: 'left' | 'right'
    name?: string
    kind?: CustomFieldKind
  }
): CustomFieldId | undefined => {
  const view = base.view()
  if (!view) {
    return undefined
  }

  const name = input.name?.trim()
  if (!name) {
    return undefined
  }

  const fieldId = dataviewId.create('field')
  const beforeFieldId = viewApi.display.insertBefore(
    view.display.fields,
    input.anchor,
    input.side
  )
  const result = base.execute([
    {
      type: 'field.create',
      input: {
        id: fieldId,
        name,
        kind: input.kind ?? 'text'
      }
    },
    {
      type: 'view.patch',
      id: view.id,
      patch: {
        display: viewApi.display.show(view.display, fieldId, beforeFieldId)
      }
    }
  ] as const satisfies readonly CoreIntent[])

  return result.ok
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
  move: (ids, target) => {
    base.patchView(view => ({
      display: viewApi.display.move(view.display, ids, target.before)
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
  setColumnWidths: widths => input.base.patchView(view => view.type === 'table'
    ? {
        options: viewApi.layout.table.patch(view.options, {
          widths
        })
      }
    : undefined),
  setVerticalLines: value => input.base.patchView(view => view.type === 'table'
    ? {
        options: viewApi.layout.table.patch(view.options, {
          showVerticalLines: value
        })
      }
    : undefined),
  setWrap: value => input.base.patchView(view => view.type === 'table'
    ? {
        options: viewApi.layout.table.patch(view.options, {
          wrap: value
        })
      }
    : undefined),
  insertField: fieldInput => insertField(input.base, fieldInput)
})

export const createGalleryApi = (
  base: ActiveViewContext
): ActiveViewApi['gallery'] => ({
  setWrap: value => base.patchView(view => view.type === 'gallery'
    ? {
        options: viewApi.layout.gallery.patch(view.options, {
          card: {
            wrap: value
          }
        })
      }
    : undefined),
  setSize: value => base.patchView(view => view.type === 'gallery'
    ? {
        options: viewApi.layout.gallery.patch(view.options, {
          card: {
            size: value
          }
        })
      }
    : undefined),
  setLayout: value => base.patchView(view => view.type === 'gallery'
    ? {
        options: viewApi.layout.gallery.patch(view.options, {
          card: {
            layout: value
          }
        })
      }
    : undefined)
})

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setWrap: value => base.patchView(view => view.type === 'kanban'
    ? {
        options: viewApi.layout.kanban.patch(view.options, {
          card: {
            wrap: value
          }
        })
      }
    : undefined),
  setSize: value => base.patchView(view => view.type === 'kanban'
    ? {
        options: viewApi.layout.kanban.patch(view.options, {
          card: {
            size: value
          }
        })
      }
    : undefined),
  setLayout: value => base.patchView(view => view.type === 'kanban'
    ? {
        options: viewApi.layout.kanban.patch(view.options, {
          card: {
            layout: value
          }
        })
      }
    : undefined),
  setFillColor: value => base.patchView(view => view.type === 'kanban'
    ? {
        options: viewApi.layout.kanban.patch(view.options, {
          fillColumnColor: value
        })
      }
    : undefined),
  setCardsPerColumn: value => base.patchView(view => view.type === 'kanban'
    ? {
        options: viewApi.layout.kanban.patch(view.options, {
          cardsPerColumn: value
        })
      }
    : undefined)
})
