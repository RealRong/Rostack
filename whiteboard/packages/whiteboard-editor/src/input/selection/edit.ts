import type { Node } from '@whiteboard/core/types'
import type { EditField } from '@whiteboard/editor/local/session/edit'

export const resolveSelectionEditField = (
  node: Node | undefined
): EditField | undefined => {
  if (!node) {
    return undefined
  }

  switch (node.type) {
    case 'text':
    case 'sticky':
    case 'shape':
      return 'text'
    default:
      return undefined
  }
}
