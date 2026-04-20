import { node as nodeApi, type TextVariant, type TextWidthMode } from '@whiteboard/core/node'
import { product } from '@whiteboard/product'
import { focusEditableEnd, readEditableText } from '@shared/dom'
import { measureTextOuterSize } from '@whiteboard/react/features/node/dom/textMeasure'

export const TEXT_DEFAULT_FONT_SIZE = nodeApi.text.defaultFontSize
export const TEXT_AUTO_MIN_WIDTH = nodeApi.text.autoMinWidth
export const TEXT_LAYOUT_MIN_WIDTH = nodeApi.text.layoutMinWidth

export const isTextContentEmpty = nodeApi.text.isContentEmpty
export const isTextNode = nodeApi.text.isTextNode
export const readTextWrapWidth = nodeApi.text.wrapWidth
export const readTextWidthMode = nodeApi.text.widthMode
export const setTextWrapWidth = nodeApi.text.setWrapWidth
export const setTextWidthMode = nodeApi.text.setWidthMode

export const STICKY_DEFAULT_FILL = product.node.templates.WHITEBOARD_STICKY_DEFAULT_FILL
export const STICKY_DEFAULT_STROKE = product.node.templates.WHITEBOARD_STICKY_DEFAULT_STROKE
export const STICKY_DEFAULT_STROKE_WIDTH = product.node.templates.WHITEBOARD_STICKY_DEFAULT_STROKE_WIDTH
export const STICKY_DEFAULT_TEXT_COLOR = product.node.templates.WHITEBOARD_STICKY_DEFAULT_TEXT_COLOR
export const STICKY_PLACEHOLDER = product.node.templates.WHITEBOARD_STICKY_PLACEHOLDER
export const TEXT_PLACEHOLDER = product.node.templates.WHITEBOARD_TEXT_PLACEHOLDER
export const TEXT_START_SIZE = product.node.templates.WHITEBOARD_TEXT_START_SIZE

export const createStickyNodeInput = product.node.templates.createWhiteboardStickyTemplate
export const createTextNodeInput = product.node.templates.createWhiteboardTextTemplate

export {
  focusEditableEnd,
  measureTextOuterSize,
  readEditableText
}

export type {
  TextVariant,
  TextWidthMode
}
