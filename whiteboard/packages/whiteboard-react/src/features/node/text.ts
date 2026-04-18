export {
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_AUTO_MIN_WIDTH,
  TEXT_LAYOUT_MIN_WIDTH,
  isTextContentEmpty,
  isTextNode,
  readTextWrapWidth,
  readTextWidthMode,
  setTextWrapWidth,
  setTextWidthMode
} from '@whiteboard/core/node'
export {
  WHITEBOARD_STICKY_DEFAULT_FILL as STICKY_DEFAULT_FILL,
  WHITEBOARD_STICKY_DEFAULT_STROKE as STICKY_DEFAULT_STROKE,
  WHITEBOARD_STICKY_DEFAULT_STROKE_WIDTH as STICKY_DEFAULT_STROKE_WIDTH,
  WHITEBOARD_STICKY_DEFAULT_TEXT_COLOR as STICKY_DEFAULT_TEXT_COLOR,
  WHITEBOARD_STICKY_PLACEHOLDER as STICKY_PLACEHOLDER,
  WHITEBOARD_TEXT_PLACEHOLDER as TEXT_PLACEHOLDER,
  WHITEBOARD_TEXT_START_SIZE as TEXT_START_SIZE,
  createWhiteboardStickyTemplate as createStickyNodeInput,
  createWhiteboardTextTemplate as createTextNodeInput
} from '@whiteboard/product/node/templates'
export type {
  TextVariant,
  TextWidthMode
} from '@whiteboard/core/node'
export {
  focusEditableEnd,
  readEditableText
} from '@shared/dom'
export {
  measureTextOuterSize
} from '@whiteboard/react/features/node/dom/textMeasure'
