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
    state: {
      tool: context.current.editor.snapshot.state.tool,
      edit: context.current.editor.snapshot.state.edit,
      preview: context.current.editor.snapshot.preview
    },
    selection: context.working.runtime.editor.interaction.selection,
    hover: context.working.runtime.editor.interaction.hover
  })
  const next = isChromeViewEqual(previous, nextCandidate)
    ? previous
    : nextCandidate

  context.working.ui.chrome = next
  context.working.graph.state.chrome = next
  context.working.phase.ui.chrome = next !== previous
  return next !== previous ? 1 : 0
}
