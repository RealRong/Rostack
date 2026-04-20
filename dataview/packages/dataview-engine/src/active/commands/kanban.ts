import {
  view as viewApi
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setWrap: value => base.patch(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        wrap: value
      }
    })
  })),
  setSize: value => base.patch(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        size: value
      }
    })
  })),
  setLayout: value => base.patch(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      card: {
        layout: value
      }
    })
  })),
  setFillColor: value => base.patch(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      fillColumnColor: value
    })
  })),
  setCardsPerColumn: value => base.patch(view => ({
    options: viewApi.layout.kanban.patch(view.options, {
      cardsPerColumn: value
    })
  }))
})
