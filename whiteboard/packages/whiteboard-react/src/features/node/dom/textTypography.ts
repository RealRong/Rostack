const TEXT_DEFAULT_LINE_HEIGHT_RATIO = 1.4
const EMPTY_LINE = '\u00A0'

export const readNumber = (
  value: string
) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const readPx = (
  value: string,
  fallback: number
) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback
}

export const readLineHeightPx = (
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

export const normalizeMeasureContent = (
  value: string
) => {
  if (!value) {
    return EMPTY_LINE
  }

  return value.endsWith('\n')
    ? `${value}${EMPTY_LINE}`
    : value
}

export const applyTypography = (
  element: HTMLElement,
  style: CSSStyleDeclaration,
  {
    fontSize,
    lineHeight,
    fontStyle,
    fontWeight
  }: {
    fontSize: number
    lineHeight: number
    fontStyle?: string
    fontWeight?: string | number
  }
) => {
  element.style.fontFamily = style.fontFamily
  element.style.fontSize = `${fontSize}px`
  element.style.fontStyle = fontStyle ?? style.fontStyle
  element.style.fontWeight = fontWeight === undefined
    ? style.fontWeight
    : `${fontWeight}`
  element.style.lineHeight = `${lineHeight}px`
  element.style.letterSpacing = style.letterSpacing
  element.style.textTransform = style.textTransform
}
