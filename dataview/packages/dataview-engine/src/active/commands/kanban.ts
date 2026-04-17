import {
  setKanbanCardsPerColumn,
  setKanbanCardLayout,
  setKanbanCardSize,
  setKanbanCardWrap,
  setKanbanFillColumnColor,
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setWrap: value => base.patch(view => ({
    options: setKanbanCardWrap(view.options, value)
  })),
  setSize: value => base.patch(view => ({
    options: setKanbanCardSize(view.options, value)
  })),
  setLayout: value => base.patch(view => ({
    options: setKanbanCardLayout(view.options, value)
  })),
  setFillColor: value => base.patch(view => ({
    options: setKanbanFillColumnColor(view.options, value)
  })),
  setCardsPerColumn: value => base.patch(view => ({
    options: setKanbanCardsPerColumn(view.options, value)
  })),
  state: base.kanbanState
})
