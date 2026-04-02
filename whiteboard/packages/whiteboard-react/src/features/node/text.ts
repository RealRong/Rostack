export {
  STICKY_DEFAULT_FILL,
  STICKY_DEFAULT_STROKE,
  STICKY_DEFAULT_STROKE_WIDTH,
  STICKY_DEFAULT_TEXT_COLOR,
  STICKY_PLACEHOLDER,
  STICKY_START_SIZE,
  TEXT_AUTO_MAX_WIDTH,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_MIN_WIDTH,
  TEXT_PLACEHOLDER,
  TEXT_START_SIZE,
  createStickyNodeInput,
  createTextNodeInput,
  isTextContentEmpty,
  isTextNode,
  readTextWidthMode,
  setTextWidthMode
} from '@whiteboard/core/node'
export type {
  TextVariant,
  TextWidthMode
} from '@whiteboard/core/node'
export {
  focusEditableEnd,
  readEditableText
} from './textContent'
export type { TextAutoFontTask } from './textLayout'
export {
  bindNodeTextSource,
  createTextAutoFontTask,
  estimateTextAutoFont,
  measureBoundTextNodeSize,
  measureTextNodeSize,
  scheduleTextAutoFont
} from './textLayout'
