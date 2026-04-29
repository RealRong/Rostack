import { idDelta } from '@shared/delta'
import type { UiContext } from './context'
import type { WhiteboardUiFacts } from '../../contracts/execution'

export const buildUiFacts = (
  context: UiContext
): WhiteboardUiFacts => ({
  node: idDelta.touched(context.working.delta.ui.node),
  edge: idDelta.touched(context.working.delta.ui.edge),
  chrome: context.working.delta.ui.chrome
})
