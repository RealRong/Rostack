import type { UiContext } from './context'
import {
  buildChromeView,
  isChromeViewEqual
} from './equality'

export const patchUiChrome = (
  context: UiContext
): number => {
  if (!context.reset && !context.touched.chrome) {
    return 0
  }

  const previous = context.working.ui.chrome
  const nextCandidate = buildChromeView({
    session: context.current.runtime.session,
    selection: context.current.runtime.interaction.selection,
    hover: context.current.runtime.interaction.hover
  })
  const next = isChromeViewEqual(previous, nextCandidate)
    ? previous
    : nextCandidate

  context.working.ui.chrome = next
  context.working.graph.state.chrome = next
  context.working.delta.ui.chrome = next !== previous
  return next !== previous ? 1 : 0
}
