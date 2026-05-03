import type { ViewportActions } from '@whiteboard/editor/actions/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'

export const createViewportActions = (
  context: EditorActionContext
): ViewportActions => ({
  set: (viewport) => {
    context.viewport.set(viewport)
  },
  panBy: (delta) => {
    context.viewport.panBy(delta)
  },
  panScreenBy: (deltaScreen) => {
    context.viewport.panScreenBy(deltaScreen)
  },
  zoomTo: (zoom, anchor) => {
    context.viewport.zoomTo(zoom, anchor)
  },
  fit: (rect, options) => {
    context.viewport.fit(rect, options)
  },
  reset: () => {
    context.viewport.reset()
  },
  wheel: (input, wheelSensitivity = 1) => {
    context.viewport.wheel(
      input,
      wheelSensitivity
    )
  }
})
