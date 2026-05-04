import type { HoverSessionActions } from '@whiteboard/editor/actions/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'
import type { EditorHoverState } from '@whiteboard/editor/state/document'
import {
  EMPTY_HOVER_STATE,
  isEditorHoverStateEqual
} from '@whiteboard/editor/state/document'
import { EMPTY_PREVIEW_STATE } from '@whiteboard/editor/state/preview'
import type { PreviewInput } from '@whiteboard/editor-scene'

const readHover = (
  context: EditorActionContext
): EditorHoverState => context.state.read().hover ?? EMPTY_HOVER_STATE

const readPreview = (
  context: EditorActionContext
): PreviewInput => context.stores.preview.get() ?? EMPTY_PREVIEW_STATE

export const createSessionHoverActions = (
  context: EditorActionContext
): HoverSessionActions => ({
  get: () => readHover(context),
  set: (hoverState) => {
    if (isEditorHoverStateEqual(readHover(context), hoverState)) {
      return
    }

    context.state.write(({
      writer
    }) => {
      writer.hover.set(hoverState)
    })
  },
  clear: () => {
    if (isEditorHoverStateEqual(readHover(context), EMPTY_HOVER_STATE)) {
      return
    }

    context.state.write(({
      writer
    }) => {
      writer.hover.clear()
    })
  },
  edgeGuide: {
    get: () => readPreview(context).edgeGuide,
    set: (value) => {
      context.state.write(({
        writer
      }) => {
        writer.preview.edgeGuide.set(value)
      })
    },
    clear: () => {
      context.state.write(({
        writer
      }) => {
        writer.preview.edgeGuide.clear()
      })
    }
  }
})
