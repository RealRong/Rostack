import {
  compileFamilyChangeFromIdDelta,
  compileValueChange,
  resetRenderPhaseDelta
} from '../../contracts/delta'
import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'
import { createRenderFacts } from '../facts'
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
  working: WorkingState
  reset: boolean
}): number => {
  resetRenderPhaseDelta(input.working.phase.render)
  const context = createRenderContext({
    ...input,
    facts: createRenderFacts(input)
  })

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

  const count = (
    patchRenderNodes(context)
    + patchRenderStatics(context)
    + patchRenderLabels(context)
    + patchRenderMasks(context)
    + patchRenderActive(context)
    + patchRenderOverlay(context)
    + patchRenderChrome(context)
  )

  input.working.delta.render.node = compileFamilyChangeFromIdDelta({
    snapshot: input.working.render.node,
    delta: input.working.phase.render.node
  })
  input.working.delta.render.edge.statics = compileFamilyChangeFromIdDelta({
    snapshot: input.working.render.statics,
    delta: input.working.phase.render.edge.statics,
    order: input.working.phase.render.edge.staticsIds
  })
  input.working.delta.render.edge.active = compileFamilyChangeFromIdDelta({
    snapshot: input.working.render.active,
    delta: input.working.phase.render.edge.active,
    order: input.working.phase.render.edge.activeIds
  })
  input.working.delta.render.edge.labels = compileFamilyChangeFromIdDelta({
    snapshot: input.working.render.labels,
    delta: input.working.phase.render.edge.labels,
    order: input.working.phase.render.edge.labelsIds
  })
  input.working.delta.render.edge.masks = compileFamilyChangeFromIdDelta({
    snapshot: input.working.render.masks,
    delta: input.working.phase.render.edge.masks,
    order: input.working.phase.render.edge.masksIds
  })
  input.working.delta.render.chrome.scene = compileValueChange(
    input.working.phase.render.chrome.scene,
    input.working.render.chrome
  )
  input.working.delta.render.chrome.edge = compileValueChange(
    input.working.phase.render.chrome.edge,
    input.working.render.overlay
  )

  return count
}
