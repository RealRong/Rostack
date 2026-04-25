import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import type { ViewState } from '@dataview/engine/contracts/view'
import type { ActiveProjectorInput } from '../contracts/projector'

export interface ActiveProjectorResetContext {
  activeViewId?: ViewId
  view?: View
  plan?: ActiveProjectorInput['view']['plan']
  previous?: ViewState
  previousViewId?: ViewState['view']['id']
  previousPlan?: ActiveProjectorInput['view']['previousPlan']
}

export const readActiveProjectorResetContext = (
  input: ActiveProjectorInput,
  previous: ViewState | undefined
): ActiveProjectorResetContext => ({
  activeViewId: input.read.reader.views.activeId(),
  view: input.read.reader.views.active(),
  plan: input.view.plan,
  previous,
  previousViewId: previous?.view.id,
  previousPlan: input.view.previousPlan
})

export const shouldResetActiveProjector = (
  context: ActiveProjectorResetContext
): boolean => !context.activeViewId
  || !context.view
  || !context.plan
