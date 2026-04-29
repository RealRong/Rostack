import { uiChange } from '../../contracts/delta'
import type { WhiteboardExecution } from '../../contracts/execution'
import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { patchUiChrome } from './chrome'
import { createUiContext } from './context'
import { patchUiEdges } from './edges'
import { buildUiFacts } from './facts'
import { patchUiNodes } from './nodes'

export const patchUiState = (input: {
  current: Input
  execution: WhiteboardExecution
  working: WorkingState
  reset: boolean
}): number => {
  input.working.delta.ui = uiChange.create()
  const context = createUiContext(input)

  const count = (
    patchUiNodes(context)
    + patchUiEdges(context)
    + patchUiChrome(context)
  )

  input.execution.ui = buildUiFacts(context)
  return count
}
