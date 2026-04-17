import type { TextTypographyProfile } from '@whiteboard/editor'

const TEXT_DEFAULT_LINE_HEIGHT_RATIO = 1.4
const EMPTY_LINE = '\u00A0'

const TYPOGRAPHY_PROFILE_CLASSNAME: Record<TextTypographyProfile, string> = {
  'default-text': 'wb-default-text-host',
  'sticky-text': 'wb-sticky-node-text wb-default-text-host',
  'edge-label': 'wb-edge-label-content wb-default-text-editor',
  'frame-title': 'wb-frame-title wb-default-text-editor',
  'shape-label': 'wb-shape-node-label-content wb-default-text-editor'
}

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

const fallbackTypographySources = new Map<TextTypographyProfile, HTMLElement>()

const ensureFallbackTypographySource = (
  profile: TextTypographyProfile
) => {
  if (typeof document === 'undefined') {
    return null
  }

  const current = fallbackTypographySources.get(profile)
  if (current?.isConnected) {
    return current
  }

  const element = document.createElement('div')
  element.className = TYPOGRAPHY_PROFILE_CLASSNAME[profile]
  element.setAttribute('data-wb-text-typography-source', 'true')
  element.setAttribute('data-wb-text-typography-profile', profile)
  element.style.position = 'fixed'
  element.style.left = '-100000px'
  element.style.top = '-100000px'
  element.style.visibility = 'hidden'
  element.style.pointerEvents = 'none'
  element.style.zIndex = '-1'
  document.body.appendChild(element)
  fallbackTypographySources.set(profile, element)
  return element
}

export const resolveTypographySource = (
  source: HTMLElement | undefined,
  profile: TextTypographyProfile
) => {
  if (source?.isConnected) {
    return source
  }

  return ensureFallbackTypographySource(profile)
}

export const readTypographyStyle = (
  source: HTMLElement | undefined,
  profile: TextTypographyProfile
) => {
  const element = resolveTypographySource(source, profile)
  return element
    ? window.getComputedStyle(element)
    : undefined
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
