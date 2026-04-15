import {
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_PLACEHOLDER
} from '@whiteboard/core/node'
import type {
  Node,
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'
import { measureTextNodeSize } from '@whiteboard/react/features/node/dom/textMeasure'
import { resolveNodeTextSource } from '@whiteboard/react/features/node/dom/textSourceRegistry'

export const createTextLayoutMeasurer = (
  readEditor: () => WhiteboardRuntime | null
) => (input: {
  nodeId: NodeId
  node: Node
  rect: Rect
}) => {
  const editor = readEditor()
  if (!editor) {
    return undefined
  }

  const source = resolveNodeTextSource(editor, input.nodeId, 'text')
  if (!source?.isConnected) {
    return undefined
  }

  return measureTextNodeSize({
    node: input.node,
    rect: {
      width: input.rect.width
    },
    content: typeof input.node.data?.text === 'string'
      ? input.node.data.text
      : '',
    placeholder: TEXT_PLACEHOLDER,
    source,
    fontSize: typeof input.node.style?.fontSize === 'number'
      ? input.node.style.fontSize
      : TEXT_DEFAULT_FONT_SIZE,
    fontStyle: typeof input.node.style?.fontStyle === 'string'
      ? input.node.style.fontStyle
      : undefined,
    fontWeight:
      typeof input.node.style?.fontWeight === 'number'
      || typeof input.node.style?.fontWeight === 'string'
        ? input.node.style.fontWeight
        : undefined,
    widthMode: undefined,
    wrapWidth: undefined
  })
}
