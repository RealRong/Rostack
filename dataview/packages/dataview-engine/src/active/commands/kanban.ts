import {
  setKanbanCardsPerColumn,
  setKanbanFillColumnColor,
  setKanbanNewRecordPosition
} from '@dataview/core/view'
import type { ActiveViewApi } from '@dataview/engine/contracts/public'
import type { ActiveViewContext } from '@dataview/engine/active/context'
import { withViewPatch } from '@dataview/engine/active/commands/shared'

export const createKanbanApi = (
  base: ActiveViewContext
): ActiveViewApi['kanban'] => ({
  setNewRecordPosition: value => withViewPatch(base, view => ({
    options: setKanbanNewRecordPosition(view.options, value)
  })),
  setFillColor: value => withViewPatch(base, view => ({
    options: setKanbanFillColumnColor(view.options, value)
  })),
  setCardsPerColumn: value => withViewPatch(base, view => ({
    options: setKanbanCardsPerColumn(view.options, value)
  })),
  state: base.kanbanState
})
