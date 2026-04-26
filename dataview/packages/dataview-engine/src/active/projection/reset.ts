import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import type { ViewState } from '@dataview/engine/contracts/view'
import type { ActiveProjectionInput } from '../contracts/projection'

export interface ActiveProjectionResetContext {
  activeViewId?: ViewId
  view?: View
  plan?: ActiveProjectionInput['view']['plan']
  previous?: ViewState
  previousViewId?: ViewState['view']['id']
  previousPlan?: ActiveProjectionInput['view']['previousPlan']
}

export const readActiveProjectionResetContext = (
  input: ActiveProjectionInput,
  previous: ViewState | undefined
): ActiveProjectionResetContext => ({
  activeViewId: input.read.reader.views.activeId(),
  view: input.read.reader.views.active(),
  plan: input.view.plan,
  previous,
  previousViewId: previous?.view.id,
  previousPlan: input.view.previousPlan
})

export const shouldResetActiveProjection = (
  context: ActiveProjectionResetContext
): boolean => !context.activeViewId
  || !context.view
  || !context.plan
