import {
  estimateTextAutoFont,
  resolveTextAutoFont,
  resolveTextContentBox,
  TEXT_DEFAULT_FONT_SIZE
} from '@whiteboard/core/node'
import type { Rect } from '@whiteboard/core/types'
import {
  readLineHeightPx,
  readNumber,
  readPx
} from './textTypography'

type StickyFitElements = {
  frame: HTMLDivElement
  content: HTMLDivElement
}

let stickyFitElements: StickyFitElements | null = null

const ensureStickyFitElements = (): StickyFitElements | null => {
  if (typeof document === 'undefined') {
    return null
  }

  if (stickyFitElements) {
    return stickyFitElements
  }

  const host = document.createElement('div')
  const frame = document.createElement('div')
  const content = document.createElement('div')

  host.setAttribute('data-wb-sticky-fit-measure', 'true')
  host.style.position = 'fixed'
  host.style.left = '-100000px'
  host.style.top = '-100000px'
  host.style.visibility = 'hidden'
  host.style.pointerEvents = 'none'
  host.style.zIndex = '-1'
  host.style.contain = 'layout style paint'

  frame.style.display = 'block'
  frame.style.margin = '0'
  frame.style.padding = '0'
  frame.style.border = '0'
  frame.style.boxSizing = 'border-box'
  frame.style.overflow = 'hidden'

  content.style.display = 'block'
  content.style.width = '100%'
  content.style.margin = '0'
  content.style.padding = '0'
  content.style.border = '0'
  content.style.boxSizing = 'border-box'

  frame.appendChild(content)
  host.appendChild(frame)
  document.body.appendChild(host)

  stickyFitElements = {
    frame,
    content
  }

  return stickyFitElements
}

const readStickyFitSignature = ({
  text,
  width,
  height,
  style
}: {
  text: string
  width: number
  height: number
  style: CSSStyleDeclaration
}) => [
  text,
  Math.round(width * 100) / 100,
  Math.round(height * 100) / 100,
  style.fontFamily,
  style.fontStyle,
  style.fontWeight,
  style.lineHeight,
  style.letterSpacing,
  style.textTransform,
  style.whiteSpace,
  style.wordBreak,
  style.overflowWrap
].join('|')

const fontSizeCache = new Map<string, number>()

export const measureStickyFontSize = ({
  text,
  rect,
  source,
  frame,
  maxFontSize
}: {
  text: string
  rect: Rect
  source: HTMLElement
  frame: HTMLElement
  maxFontSize?: number
}) => {
  const resolvedText = text.trim()
  const fallback = estimateTextAutoFont('sticky', rect)
  if (!resolvedText) {
    return fallback
  }

  const elements = ensureStickyFitElements()
  if (!elements) {
    return fallback
  }

  const frameRect = frame.getBoundingClientRect()
  if (frameRect.width <= 0 || frameRect.height <= 0) {
    return fallback
  }

  const sourceStyle = window.getComputedStyle(source)
  const sourceFontSize = readPx(sourceStyle.fontSize, TEXT_DEFAULT_FONT_SIZE)
  const contentBox = resolveTextContentBox({
    width: frameRect.width,
    height: frameRect.height,
    paddingTop: readNumber(sourceStyle.paddingTop),
    paddingRight: readNumber(sourceStyle.paddingRight),
    paddingBottom: readNumber(sourceStyle.paddingBottom),
    paddingLeft: readNumber(sourceStyle.paddingLeft),
    borderTop: readNumber(sourceStyle.borderTopWidth),
    borderRight: readNumber(sourceStyle.borderRightWidth),
    borderBottom: readNumber(sourceStyle.borderBottomWidth),
    borderLeft: readNumber(sourceStyle.borderLeftWidth)
  })
  const range = resolveTextAutoFont('sticky', contentBox)
  const resolvedMaxFontSize = Math.max(
    range.min,
    Math.min(
      range.max,
      Math.floor(maxFontSize ?? range.initial)
    )
  )
  const signature = readStickyFitSignature({
    text: resolvedText,
    width: contentBox.width,
    height: contentBox.height,
    style: sourceStyle
  }) + `|${resolvedMaxFontSize}`
  const cached = fontSizeCache.get(signature)
  if (cached !== undefined) {
    return cached
  }

  elements.frame.style.width = `${contentBox.width}px`
  elements.frame.style.height = `${contentBox.height}px`

  elements.content.style.fontFamily = sourceStyle.fontFamily
  elements.content.style.fontStyle = sourceStyle.fontStyle
  elements.content.style.fontWeight = sourceStyle.fontWeight
  elements.content.style.letterSpacing = sourceStyle.letterSpacing
  elements.content.style.textTransform = sourceStyle.textTransform
  elements.content.style.whiteSpace = sourceStyle.whiteSpace
  elements.content.style.wordBreak = sourceStyle.wordBreak
  elements.content.style.overflowWrap = sourceStyle.overflowWrap
  elements.content.textContent = resolvedText

  let low = range.min
  let high = resolvedMaxFontSize
  let best = resolvedMaxFontSize

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    elements.content.style.fontSize = `${mid}px`
    elements.content.style.lineHeight = `${readLineHeightPx(
      sourceStyle.lineHeight,
      sourceFontSize,
      mid
    )}px`

    const fits = (
      elements.frame.scrollWidth <= contentBox.width
      && elements.frame.scrollHeight <= contentBox.height
    )

    if (fits) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }

  fontSizeCache.set(signature, best)
  return best
}
