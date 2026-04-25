import type {
  EdgeDash,
  EdgeMarker,
  EdgeStyle
} from '@whiteboard/core/types'

export interface EdgeStaticStyle {
  color?: string
  width: number
  opacity: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
}

export const staticStyle = (
  style: EdgeStyle | undefined
): EdgeStaticStyle => ({
  color: style?.color,
  width: style?.width ?? 2,
  opacity: style?.opacity ?? 1,
  dash: style?.dash,
  start: style?.start,
  end: style?.end
})

export const styleKey = (
  style: EdgeStyle | undefined
): string => {
  const resolved = staticStyle(style)

  return [
    resolved.color ?? '',
    resolved.width,
    resolved.opacity,
    resolved.dash ?? '',
    resolved.start ?? '',
    resolved.end ?? ''
  ].join('|')
}
