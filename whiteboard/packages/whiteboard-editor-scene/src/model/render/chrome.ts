import { equal } from '@shared/core'
import type { ChromeRenderView } from '../../contracts/render'
import { applyValue } from '@shared/projection'
import type { RenderContext } from './context'
import { isOverlayViewEqual } from './overlay'

const isChromeRenderViewEqual = (
  left: ChromeRenderView,
  right: ChromeRenderView
): boolean => (
  left.marquee?.match === right.marquee?.match
  && equal.sameOptionalRect(left.marquee?.worldRect, right.marquee?.worldRect)
  && left.guides === right.guides
  && left.draw === right.draw
  && left.mindmap === right.mindmap
  && isOverlayViewEqual(left.edge, right.edge)
)

const buildChromeRenderView = (
  context: RenderContext
): ChromeRenderView => ({
  marquee: context.working.ui.chrome.preview.marquee,
  guides: context.working.ui.chrome.preview.guides,
  draw: context.working.ui.chrome.preview.draw,
  mindmap: context.working.ui.chrome.preview.mindmap,
  edge: context.working.render.overlay
})

export const patchRenderChrome = (
  context: RenderContext
): number => {
  if (!context.reset && !context.touched.chrome && !context.touched.overlay) {
    return 0
  }

  return applyValue({
    previous: context.working.render.chrome,
    next: buildChromeRenderView(context),
    equal: isChromeRenderViewEqual,
    write: (next) => {
      context.working.render.chrome = next
    },
    writeDelta: (changed) => {
      context.working.phase.render.chrome.scene = changed
    }
  })
}
