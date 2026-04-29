import {
  compileFamilyChangeFromIdDelta,
  compileValueChange,
  resetUiPhaseDelta
} from '../../contracts/delta'
import type { Input } from '../../contracts/editor'
import type { EditorScenePlan } from '../../contracts/plan'
import type { WorkingState } from '../../contracts/working'
import { patchUiChrome } from './chrome'
import { createUiContext } from './context'
import { patchUiEdges } from './edges'
import { patchUiNodes } from './nodes'

export const patchUiState = (input: {
  current: Input
  plan: EditorScenePlan
  working: WorkingState
  reset: boolean
}): number => {
  resetUiPhaseDelta(input.working.phase.ui)
  const context = createUiContext(input)

  const count = (
    patchUiNodes(context)
    + patchUiEdges(context)
    + patchUiChrome(context)
  )

  input.working.delta.graph.state.node = compileFamilyChangeFromIdDelta({
    snapshot: input.working.graph.state.node,
    delta: input.working.phase.ui.node
  })
  input.working.delta.graph.state.edge = compileFamilyChangeFromIdDelta({
    snapshot: input.working.graph.state.edge,
    delta: input.working.phase.ui.edge
  })
  input.working.delta.graph.state.chrome = compileValueChange(
    input.working.phase.ui.chrome,
    input.working.graph.state.chrome
  )

  return count
}
