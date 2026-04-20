import {
  view as viewApi
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setWrap: value => base.patch(view => ({
    options: viewApi.layout.kanban.setWrap(view.options, value)
  })),
  setSize: value => base.patch(view => ({
    options: viewApi.layout.kanban.setSize(view.options, value)
  })),
  setLayout: value => base.patch(view => ({
    options: viewApi.layout.kanban.setLayout(view.options, value)
  })),
  setFillColor: value => base.patch(view => ({
    options: viewApi.layout.kanban.setFillColumnColor(view.options, value)
  })),
  setCardsPerColumn: value => base.patch(view => ({
    options: viewApi.layout.kanban.setCardsPerColumn(view.options, value)
  }))
})
