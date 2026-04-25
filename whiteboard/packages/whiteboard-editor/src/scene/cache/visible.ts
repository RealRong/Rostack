import type { Rect } from '@whiteboard/core/types'
import type { Read as EditorGraphQuery } from '@whiteboard/editor-scene'

export const createSceneVisible = (input: {
  revision: () => number
  visibleRect: () => Rect
  rect: EditorGraphQuery['spatial']['rect']
}) => {
  const state = {
    revision: -1,
    rect: undefined as Rect | undefined,
    kinds: '' as string,
    result: [] as ReturnType<EditorGraphQuery['spatial']['rect']>
  }

  return (
    options?: Parameters<EditorGraphQuery['spatial']['rect']>[1]
  ) => {
    const rect = input.visibleRect()
    const revision = input.revision()
    const kinds = options?.kinds?.join('|') ?? '*'

    if (
      state.revision === revision
      && state.kinds === kinds
      && state.rect?.x === rect.x
      && state.rect?.y === rect.y
      && state.rect?.width === rect.width
      && state.rect?.height === rect.height
    ) {
      return state.result
    }

    const result = input.rect(rect, options)
    state.revision = revision
    state.rect = rect
    state.kinds = kinds
    state.result = result
    return result
  }
}
