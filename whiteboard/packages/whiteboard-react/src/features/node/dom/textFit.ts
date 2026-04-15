import {
  resolveTextAutoFont,
  TEXT_DEFAULT_FONT_SIZE
} from '@whiteboard/core/node'
import type { Size } from '@whiteboard/core/types'
import {
  readLineHeightPx,
  readPx
} from '@whiteboard/react/features/node/dom/textTypography'

type TextFitElements = {
  frame: HTMLDivElement
  content: HTMLDivElement
}

let textFitElements: TextFitElements | null = null

const ensureTextFitElements = (): TextFitElements | null => {
  if (typeof document === 'undefined') {
    return null
  }

  if (textFitElements) {
    return textFitElements
  }

  const host = document.createElement('div')
  const frame = document.createElement('div')
  const content = document.createElement('div')

  host.setAttribute('data-wb-text-fit-measure', 'true')
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

  textFitElements = {
    frame,
    content
  }

  return textFitElements
}

const readTextFitSignature = ({
  text,
  box,
  style,
  textAlign,
  minFontSize,
  maxFontSize
}: {
  text: string
  box: Size
  style: CSSStyleDeclaration
  textAlign?: 'left' | 'center' | 'right'
  minFontSize: number
  maxFontSize: number
}) => [
  text,
  Math.round(box.width * 100) / 100,
  Math.round(box.height * 100) / 100,
  style.fontFamily,
  style.fontStyle,
  style.fontWeight,
  style.lineHeight,
  style.letterSpacing,
  style.textTransform,
  style.whiteSpace,
  style.wordBreak,
  style.overflowWrap,
  textAlign,
  minFontSize,
  maxFontSize
].join('|')

const fontSizeCache = new Map<string, number>()

export const measureFitFontSize = ({
  text,
  box,
  source,
  minFontSize,
  maxFontSize,
  textAlign
}: {
  text: string
  box: Size
  source: HTMLElement
  minFontSize?: number
  maxFontSize?: number
  textAlign?: 'left' | 'center' | 'right'
}) => {
  const resolvedText = text.trim()
  const range = resolveTextAutoFont('sticky', box)
  const fallback = Math.max(
    range.min,
    Math.min(range.max, range.initial)
  )
  if (!resolvedText || box.width <= 0 || box.height <= 0) {
    return fallback
  }

  const elements = ensureTextFitElements()
  if (!elements) {
    return fallback
  }

  const sourceStyle = window.getComputedStyle(source)
  const sourceFontSize = readPx(sourceStyle.fontSize, TEXT_DEFAULT_FONT_SIZE)
  const resolvedMinFontSize = Math.max(1, Math.floor(minFontSize ?? range.min))
  const resolvedMaxFontSize = Math.max(
    resolvedMinFontSize,
    Math.floor(maxFontSize ?? range.max)
  )
  const signature = readTextFitSignature({
    text: resolvedText,
    box,
    style: sourceStyle,
    textAlign,
    minFontSize: resolvedMinFontSize,
    maxFontSize: resolvedMaxFontSize
  })
  const cached = fontSizeCache.get(signature)
  if (cached !== undefined) {
    return cached
  }

  elements.frame.style.width = `${box.width}px`
  elements.frame.style.height = `${box.height}px`

  elements.content.style.fontFamily = sourceStyle.fontFamily
  elements.content.style.fontStyle = sourceStyle.fontStyle
  elements.content.style.fontWeight = sourceStyle.fontWeight
  elements.content.style.letterSpacing = sourceStyle.letterSpacing
  elements.content.style.textTransform = sourceStyle.textTransform
  elements.content.style.whiteSpace = sourceStyle.whiteSpace
  elements.content.style.wordBreak = sourceStyle.wordBreak
  elements.content.style.overflowWrap = sourceStyle.overflowWrap
  elements.content.style.textAlign = textAlign ?? sourceStyle.textAlign
  elements.content.textContent = resolvedText

  let low = resolvedMinFontSize
  let high = resolvedMaxFontSize
  let best = fallback

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    elements.content.style.fontSize = `${mid}px`
    elements.content.style.lineHeight = `${readLineHeightPx(
      sourceStyle.lineHeight,
      sourceFontSize,
      mid
    )}px`

    const fits = (
      elements.frame.scrollWidth <= box.width
      && elements.frame.scrollHeight <= box.height
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
