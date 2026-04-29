import { renderChange } from '../../contracts/delta'
import type { Input } from '../../contracts/editor'
import type { WhiteboardExecution } from '../../contracts/execution'
import type { WorkingState } from '../../contracts/working'
import { patchRenderActive } from './active'
import { patchRenderChrome } from './chrome'
import { createRenderContext } from './context'
import { patchRenderLabels } from './labels'
import { patchRenderMasks } from './masks'
import { patchRenderNodes } from './nodes'
import { patchRenderOverlay } from './overlay'
import { patchRenderStatics } from './statics'

export const patchRenderState = (input: {
  current: Input
  execution: WhiteboardExecution
  working: WorkingState
  reset: boolean
}): number => {
  input.working.delta.render = renderChange.create()
  const context = createRenderContext(input)

  if (
    !context.reset
    && context.touched.node.size === 0
    && context.touched.edge.statics.size === 0
    && context.touched.edge.active.size === 0
    && context.touched.edge.labels.size === 0
    && context.touched.edge.masks.size === 0
    && !context.touched.overlay
    && !context.touched.chrome
  ) {
    return 0
  }

  return (
    patchRenderNodes(context)
    + patchRenderStatics(context)
    + patchRenderLabels(context)
    + patchRenderMasks(context)
    + patchRenderActive(context)
    + patchRenderOverlay(context)
    + patchRenderChrome(context)
  )
}
