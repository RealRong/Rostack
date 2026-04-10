import {
  readTextWidthMode,
  TEXT_AUTO_MAX_WIDTH,
  TEXT_DEFAULT_FONT_SIZE,
  TEXT_MIN_WIDTH,
  TEXT_PLACEHOLDER
} from '@whiteboard/core/node'
import type {
  Node,
  NodeId,
  Rect,
  Size
} from '@whiteboard/core/types'
import type { WhiteboardRuntime as Editor } from '#react/types/runtime'
import { resolveNodeTextSource } from './textSourceRegistry'

type TextMeasureElements = {
  line: HTMLDivElement
  block: HTMLDivElement
}

const TEXT_DEFAULT_LINE_HEIGHT_RATIO = 1.4
const EMPTY_LINE = '\u00A0'

let textMeasureElements: TextMeasureElements | null = null

const readNumber = (
  value: string
) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const readPx = (
  value: string,
  fallback: number
) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback
}

const readLineHeightPx = (
  lineHeight: string,
  sourceFontSize: number,
  fontSize: number
) => {
  if (lineHeight === 'normal') {
    return fontSize * TEXT_DEFAULT_LINE_HEIGHT_RATIO
  }

  const parsed = Number.parseFloat(lineHeight)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed * (sourceFontSize > 0 ? fontSize / sourceFontSize : 1)
    : fontSize * TEXT_DEFAULT_LINE_HEIGHT_RATIO
}

const normalizeMeasureContent = (
  value: string
) => {
  if (!value) {
    return EMPTY_LINE
  }

  return value.endsWith('\n')
    ? `${value}${EMPTY_LINE}`
    : value
}

const applyTypography = (
  element: HTMLDivElement,
  style: CSSStyleDeclaration,
  {
    fontSize,
    lineHeight
  }: {
    fontSize: number
    lineHeight: number
  }
) => {
  element.style.fontFamily = style.fontFamily
  element.style.fontSize = `${fontSize}px`
  element.style.fontStyle = style.fontStyle
  element.style.fontWeight = style.fontWeight
  element.style.lineHeight = `${lineHeight}px`
  element.style.letterSpacing = style.letterSpacing
  element.style.textTransform = style.textTransform
}

const ensureTextMeasureElements = (): TextMeasureElements | null => {
  if (typeof document === 'undefined') {
    return null
  }

  if (textMeasureElements) {
    return textMeasureElements
  }

  const host = document.createElement('div')
  const line = document.createElement('div')
  const block = document.createElement('div')

  host.setAttribute('data-wb-text-measure', 'true')
  host.style.position = 'fixed'
  host.style.left = '-100000px'
  host.style.top = '-100000px'
  host.style.visibility = 'hidden'
  host.style.pointerEvents = 'none'
  host.style.zIndex = '-1'
  host.style.contain = 'layout style paint'

  line.style.display = 'inline-block'
  line.style.width = 'auto'
  line.style.minWidth = '0'
  line.style.margin = '0'
  line.style.padding = '0'
  line.style.border = '0'
  line.style.boxSizing = 'border-box'
  line.style.whiteSpace = 'pre'
  line.style.wordBreak = 'normal'
  line.style.overflowWrap = 'normal'

  block.style.display = 'block'
  block.style.width = 'auto'
  block.style.minWidth = '0'
  block.style.margin = '0'
  block.style.padding = '0'
  block.style.border = '0'
  block.style.boxSizing = 'border-box'
  block.style.whiteSpace = 'pre-wrap'
  block.style.wordBreak = 'break-word'
  block.style.overflowWrap = 'break-word'

  host.appendChild(line)
  host.appendChild(block)
  document.body.appendChild(host)

  textMeasureElements = {
    line,
    block
  }

  return textMeasureElements
}

const measureTextContent = ({
  content,
  placeholder,
  source,
  minWidth,
  maxWidth,
  fontSize,
  caretWidth = 2
}: {
  content: string
  placeholder: string
  source: HTMLElement
  minWidth: number
  maxWidth: number
  fontSize?: number
  caretWidth?: number
}): Size | undefined => {
  const elements = ensureTextMeasureElements()
  if (!elements) {
    return undefined
  }

  const sourceStyle = window.getComputedStyle(source)
  const sourceFontSize = readPx(sourceStyle.fontSize, TEXT_DEFAULT_FONT_SIZE)
  const resolvedFontSize = fontSize ?? sourceFontSize
  const resolvedLineHeight = readLineHeightPx(
    sourceStyle.lineHeight,
    sourceFontSize,
    resolvedFontSize
  )
  const minHeight = Math.ceil(resolvedLineHeight)
  const resolvedMinWidth = Math.max(1, Math.ceil(minWidth))
  const resolvedMaxWidth = Math.max(resolvedMinWidth, Math.ceil(maxWidth))
  const measuredContent = content || placeholder

  applyTypography(elements.line, sourceStyle, {
    fontSize: resolvedFontSize,
    lineHeight: resolvedLineHeight
  })
  applyTypography(elements.block, sourceStyle, {
    fontSize: resolvedFontSize,
    lineHeight: resolvedLineHeight
  })

  elements.line.textContent = normalizeMeasureContent(measuredContent)
  elements.line.style.maxWidth = `${resolvedMaxWidth}px`

  const singleLineWidth = Math.ceil(elements.line.getBoundingClientRect().width + caretWidth)
  const width = Math.min(
    resolvedMaxWidth,
    Math.max(resolvedMinWidth, singleLineWidth)
  )

  elements.block.textContent = normalizeMeasureContent(measuredContent)
  elements.block.style.width = `${width}px`
  const measuredHeight = Math.ceil(elements.block.getBoundingClientRect().height)

  return {
    width,
    height: Math.max(minHeight, measuredHeight)
  }
}

export const measureTextNodeSize = ({
  node,
  rect,
  content,
  placeholder,
  source,
  minWidth,
  maxWidth,
  fontSize
}: {
  node: Pick<Node, 'type' | 'data'>
  rect: Pick<Rect, 'width'>
  content: string
  placeholder: string
  source: HTMLElement
  minWidth?: number
  maxWidth?: number
  fontSize?: number
}): Size | undefined => {
  const mode = readTextWidthMode(node)
  const resolvedWidth = Math.max(TEXT_MIN_WIDTH, Math.ceil(rect.width))

  if (mode === 'fixed') {
    return measureTextContent({
      content,
      placeholder,
      source,
      minWidth: resolvedWidth,
      maxWidth: resolvedWidth,
      fontSize
    })
  }

  const resolvedMinWidth = Math.max(
    TEXT_MIN_WIDTH,
    Math.ceil(minWidth ?? TEXT_MIN_WIDTH)
  )
  const resolvedMaxWidth = Math.max(
    resolvedWidth,
    TEXT_AUTO_MAX_WIDTH,
    Math.ceil(maxWidth ?? TEXT_AUTO_MAX_WIDTH)
  )

  return measureTextContent({
    content,
    placeholder,
    source,
    minWidth: resolvedMinWidth,
    maxWidth: resolvedMaxWidth,
    fontSize
  })
}

export const measureBoundTextNodeSize = ({
  editor,
  nodeId,
  value,
  fontSize,
  minWidth,
  maxWidth
}: {
  editor: Editor
  nodeId: NodeId
  value: string
  fontSize?: number
  minWidth?: number
  maxWidth?: number
}) => {
  const item = editor.select.node.item().get(nodeId)
  if (!item || item.node.type !== 'text') {
    return undefined
  }

  const source = resolveNodeTextSource(editor, nodeId, 'text')
  if (!source) {
    return undefined
  }

  return measureTextNodeSize({
    node: item.node,
    rect: item.rect,
    content: value,
    placeholder: TEXT_PLACEHOLDER,
    source,
    minWidth,
    maxWidth,
    fontSize
  })
}
