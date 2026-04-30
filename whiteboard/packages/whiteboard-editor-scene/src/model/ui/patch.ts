import {
  compileFamilyChangeFromIdDelta,
  compileValueChange,
  resetUiPhaseDelta
} from '../../contracts/delta'
import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import {
  createUiFacts,
  createUiTargets
} from '../facts'
import { patchUiChrome } from './chrome'
import { createUiContext } from './context'
import { patchUiEdges } from './edges'
import { patchUiNodes } from './nodes'

export const patchUiState = (input: {
  current: Input
  working: WorkingState
  reset: boolean
}): number => {
  resetUiPhaseDelta(input.working.phase.ui)
  const targets = createUiTargets(input)
  const context = createUiContext({
    ...input,
    facts: targets
  })

  if (
    !input.reset
    && context.touched.node.size === 0
    && context.touched.edge.size === 0
    && !context.touched.chrome
  ) {
    input.working.facts.ui = createUiFacts({
      working: input.working,
      reset: false
    })
    return 0
  }

  const count = (
    patchUiNodes(context)
    + patchUiEdges(context)
    + patchUiChrome(context)
  )

  input.working.facts.ui = createUiFacts({
    working: input.working,
    reset: input.reset
  })

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
