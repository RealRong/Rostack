export {
  STICKY_DEFAULT_FILL,
  STICKY_DEFAULT_STROKE,
  STICKY_DEFAULT_STROKE_WIDTH,
  STICKY_DEFAULT_TEXT_COLOR,
  STICKY_PLACEHOLDER,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_AUTO_MIN_WIDTH,
  TEXT_LAYOUT_MIN_WIDTH,
  TEXT_PLACEHOLDER,
  TEXT_START_SIZE,
  createStickyNodeInput,
  createTextNodeInput,
  isTextContentEmpty,
  isTextNode,
  readTextWrapWidth,
  readTextWidthMode,
  setTextWrapWidth,
  setTextWidthMode
} from '@whiteboard/core/node'
export type {
  TextVariant,
  TextWidthMode
} from '@whiteboard/core/node'
export {
  focusEditableEnd,
  readEditableText
} from '@shared/dom'
export { bindNodeTextSource } from '@whiteboard/react/features/node/dom/textSourceRegistry'
export {
  measureTextNodeSize
} from '@whiteboard/react/features/node/dom/textMeasure'
