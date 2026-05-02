import type {
  CustomFieldId,
  CustomFieldKind,
  FieldId,
  Intent as CoreIntent
} from '@dataview/core/types'
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
    viewApi.display.read.ids(view.display),
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
  set: (fieldId, metric) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.calc.set',
      id: viewId,
      field: fieldId,
      metric
    })
  }
})

export const createTableApi = (input: {
  base: ActiveViewContext
}): ActiveViewApi['table'] => ({
  setColumnWidths: (widths) => {
    const viewId = input.base.id()
    if (!viewId) {
      return
    }

    input.base.execute({
      type: 'view.table.widths.set',
      id: viewId,
      widths
    })
  },
  setVerticalLines: (value) => {
    const viewId = input.base.id()
    if (!viewId) {
      return
    }

    input.base.execute({
      type: 'view.table.verticalLines.set',
      id: viewId,
      value
    })
  },
  setWrap: (value) => {
    const viewId = input.base.id()
    if (!viewId) {
      return
    }

    input.base.execute({
      type: 'view.table.wrap.set',
      id: viewId,
      value
    })
  },
  insertField: fieldInput => insertField(input.base, fieldInput)
})

export const createGalleryApi = (
  base: ActiveViewContext
): ActiveViewApi['gallery'] => ({
  setWrap: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.gallery.wrap.set',
      id: viewId,
      value
    })
  },
  setSize: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.gallery.size.set',
      id: viewId,
      value
    })
  },
  setLayout: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.gallery.layout.set',
      id: viewId,
      value
    })
  }
})

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setWrap: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.kanban.wrap.set',
      id: viewId,
      value
    })
  },
  setSize: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.kanban.size.set',
      id: viewId,
      value
    })
  },
  setLayout: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.kanban.layout.set',
      id: viewId,
      value
    })
  },
  setFillColor: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.kanban.fillColor.set',
      id: viewId,
      value
    })
  },
  setCardsPerColumn: (value) => {
    const viewId = base.id()
    if (!viewId) {
      return
    }

    base.execute({
      type: 'view.kanban.cardsPerColumn.set',
      id: viewId,
      value
    })
  }
})
