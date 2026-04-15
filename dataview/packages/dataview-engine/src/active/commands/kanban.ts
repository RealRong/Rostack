import {
  setKanbanCardsPerColumn,
  setKanbanFillColumnColor,
  setKanbanNewRecordPosition
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setNewRecordPosition: value => base.patch(view => ({
    options: setKanbanNewRecordPosition(view.options, value)
  })),
  setFillColor: value => base.patch(view => ({
    options: setKanbanFillColumnColor(view.options, value)
  })),
  setCardsPerColumn: value => base.patch(view => ({
    options: setKanbanCardsPerColumn(view.options, value)
  })),
  state: base.kanbanState
})
