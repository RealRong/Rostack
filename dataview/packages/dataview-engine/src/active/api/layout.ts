import type {
  CustomFieldId,
  CustomFieldKind,
  FieldId
} from '@dataview/core/types'
import type {
  Intent as CoreIntent
} from '@dataview/core/intent'
import { createId } from '@shared/core'
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

  const fieldId = createId('field') as CustomFieldId
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
      type: 'view.display.show',
      id: view.id,
      field: fieldId,
      ...(beforeFieldId !== undefined && beforeFieldId !== null
        ? { before: beforeFieldId }
        : {})
    }
  ] as const satisfies readonly CoreIntent[])

  return result.ok
    ? fieldId
    : undefined
}

export const createDisplayApi = (
  base: ActiveViewContext
): ActiveViewApi['display'] => ({
  move: (ids, target) => {
    const viewId = base.id()
    if (!viewId || !ids.length) {
      return
    }

    base.execute(ids.length === 1
      ? {
          type: 'view.display.move',
          id: viewId,
          field: ids[0]!,
          ...(target.before !== undefined && target.before !== null
            ? { before: target.before }
            : {})
        }
      : {
          type: 'view.display.splice',
          id: viewId,
          fields: [...ids],
          ...(target.before !== undefined && target.before !== null
            ? { before: target.before }
            : {})
        })
  },
  show: (fieldId, beforeFieldId) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.display.show',
      id: viewId,
      field: fieldId,
      ...(beforeFieldId !== undefined && beforeFieldId !== null
        ? { before: beforeFieldId }
        : {})
    })
  },
  hide: fieldId => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.display.hide',
      id: viewId,
      field: fieldId
    })
  },
  clear: () => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.display.clear',
      id: viewId
    })
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
