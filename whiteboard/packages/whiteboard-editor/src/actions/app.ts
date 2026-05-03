import type { AppActions } from '@whiteboard/editor/actions/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'

export const createAppActions = (
  context: EditorActionContext
): AppActions => ({
  replace: (document) => context.write.document.replace(document)
})
