import {
  node as nodeApi,
  type TextFrameMetrics,
  type TextWidthMode
} from '@whiteboard/core/node'
import type { Size } from '@whiteboard/core/types'
import {
  applyTypography,
  normalizeMeasureContent,
  readLineHeightPx,
  readPx,
  readTypographyStyle
} from '@whiteboard/react/features/node/dom/textTypography'
import type { TextTypographyProfile } from '@whiteboard/editor'

type TextMeasureElements = {
  line: HTMLDivElement
  block: HTMLDivElement
}

let textMeasureElements: TextMeasureElements | null = null

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
  typography,
  minWidth,
  maxWidth,
  fontSize,
  fontStyle,
  fontWeight,
  caretWidth = 2
}: {
  content: string
  placeholder: string
  source?: HTMLElement
  typography: TextTypographyProfile
  minWidth: number
  maxWidth: number
  fontSize?: number
  fontStyle?: string
  fontWeight?: string | number
  caretWidth?: number
}): Size | undefined => {
  const elements = ensureTextMeasureElements()
  if (!elements) {
    return undefined
  }

  const sourceStyle = readTypographyStyle(source, typography)
  if (!sourceStyle) {
    return undefined
  }
  const sourceFontSize = readPx(sourceStyle.fontSize, nodeApi.text.defaultFontSize)
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
    lineHeight: resolvedLineHeight,
    fontStyle,
    fontWeight
  })
  applyTypography(elements.block, sourceStyle, {
    fontSize: resolvedFontSize,
    lineHeight: resolvedLineHeight,
    fontStyle,
    fontWeight
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

export const measureTextOuterSize = ({
  content,
  placeholder,
  source,
  typography,
  fontSize,
  fontStyle,
  fontWeight,
  widthMode,
  wrapWidth,
  frame,
  minWidth,
  maxWidth
}: {
  content: string
  placeholder: string
  source?: HTMLElement
  typography: TextTypographyProfile
  fontSize?: number
  fontStyle?: string
  fontWeight?: string | number
  widthMode: TextWidthMode
  wrapWidth?: number
  frame?: Omit<TextFrameMetrics, 'width' | 'height'>
  minWidth?: number
  maxWidth?: number
}): Size | undefined => {
  const horizontalInset = frame
    ? frame.paddingLeft + frame.paddingRight + frame.borderLeft + frame.borderRight
    : 0
  const verticalInset = frame
    ? frame.paddingTop + frame.paddingBottom + frame.borderTop + frame.borderBottom
    : 0

  if (widthMode === 'wrap') {
    const resolvedOuterMinWidth = Math.max(
      nodeApi.text.layoutMinWidth,
      Math.ceil(minWidth ?? nodeApi.text.layoutMinWidth)
    )
    const resolvedOuterMaxWidth = Math.max(
      resolvedOuterMinWidth,
      Math.ceil(maxWidth ?? wrapWidth ?? resolvedOuterMinWidth)
    )
    const resolvedOuterWrapWidth = Math.min(
      resolvedOuterMaxWidth,
      Math.max(
        resolvedOuterMinWidth,
        Math.ceil(wrapWidth ?? resolvedOuterMinWidth)
      )
    )
    const resolvedWrapWidth = frame
      ? nodeApi.text.contentBox({
          ...frame,
          width: resolvedOuterWrapWidth,
          height: verticalInset + 1
        }).width
      : resolvedOuterWrapWidth

    const measured = measureTextContent({
      content,
      placeholder,
      source,
      typography,
      minWidth: resolvedWrapWidth,
      maxWidth: resolvedWrapWidth,
      fontSize,
      fontStyle,
      fontWeight
    })

    return measured
      ? {
          width: measured.width + horizontalInset,
          height: measured.height + verticalInset
        }
      : undefined
  }

  const resolvedOuterMinWidth = Math.max(
    nodeApi.text.autoMinWidth,
    Math.ceil(minWidth ?? nodeApi.text.autoMinWidth)
  )
  const resolvedOuterMaxWidth = Math.max(
    resolvedOuterMinWidth,
    Math.ceil(maxWidth ?? nodeApi.text.autoMaxWidth)
  )
  const resolvedMinWidth = Math.max(resolvedOuterMinWidth - horizontalInset, 1)
  const resolvedMaxWidth = Math.max(resolvedOuterMaxWidth - horizontalInset, resolvedMinWidth)
  const measured = measureTextContent({
    content,
    placeholder,
    source,
    typography,
    minWidth: resolvedMinWidth,
    maxWidth: resolvedMaxWidth,
    fontSize,
    fontStyle,
    fontWeight
  })

  return measured
    ? {
        width: measured.width + horizontalInset,
        height: measured.height + verticalInset
      }
    : undefined
}
