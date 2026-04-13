import {
  setKanbanCardsPerColumn,
  setKanbanFillColumnColor,
  setKanbanNewRecordPosition
} from '@dataview/core/view'
import type { ActiveViewApi } from '#dataview-engine/contracts/public'
import type { ActiveViewContext } from '#dataview-engine/active/context'

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setNewRecordPosition: value => {
    base.withView(view => {
      base.commitPatch({
        options: setKanbanNewRecordPosition(view.options, value)
      })
    })
  },
  setFillColor: value => {
    base.withView(view => {
      base.commitPatch({
        options: setKanbanFillColumnColor(view.options, value)
      })
    })
  },
  setCardsPerColumn: value => {
    base.withView(view => {
      base.commitPatch({
        options: setKanbanCardsPerColumn(view.options, value)
      })
    })
  },
  state: base.kanbanState
})
