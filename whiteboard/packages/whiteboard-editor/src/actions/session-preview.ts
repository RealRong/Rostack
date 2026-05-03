import type { PreviewSessionActions } from '@whiteboard/editor/actions/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'
import { EMPTY_PREVIEW_STATE } from '@whiteboard/editor/state/preview'
import type { PreviewInput } from '@whiteboard/editor-scene'

const readPreview = (
  context: EditorActionContext
): PreviewInput => context.stores.preview.get() ?? EMPTY_PREVIEW_STATE

export const createSessionPreviewActions = (
  context: EditorActionContext
): PreviewSessionActions => ({
  get: () => readPreview(context),
  reset: () => {
    context.state.write(({
      writer
    }) => {
      writer.preview.reset()
    })
  },
  clear: () => {
    context.state.write(({
      writer
    }) => {
      writer.preview.reset()
    })
  }
})
