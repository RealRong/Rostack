import {
  setKanbanCardsPerColumn,
  setKanbanFillColumnColor,
  setKanbanNewRecordPosition
} from '@dataview/core/view'
import type { ActiveViewApi } from '../../contracts/public'
import type { ActiveViewContext } from '../context'

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
