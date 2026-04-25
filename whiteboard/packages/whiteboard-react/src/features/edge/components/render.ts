import type { CSSProperties } from 'react'
import { edge as edgeApi } from '@whiteboard/core/edge'
import type { EdgeId } from '@whiteboard/core/types'
import { product } from '@whiteboard/product'
import { resolveEdgeDash } from '@whiteboard/react/features/edge/constants'
import { resolvePaletteColor, resolvePaletteColorOr } from '@whiteboard/react/features/palette'
import { resolveEdgeMarkerUrl } from '@whiteboard/react/features/edge/ui/marker'
import type {
  EdgeLabelRenderItem,
  EdgeRenderStyle
} from '@whiteboard/editor/types/editor'

export const readEdgeLabelMaskId = (
  edgeId: EdgeId
) => `wb-edge-label-mask-${edgeId}`

export const resolveEdgePathPresentation = (
  style: EdgeRenderStyle
) => ({
  stroke: resolvePaletteColorOr(
    style.color,
    product.palette.defaults.lineColor
  ) ?? 'currentColor',
  strokeWidth: style.width,
  strokeOpacity: style.opacity,
  dash: resolveEdgeDash(style.dash),
  markerStart: resolveEdgeMarkerUrl(style.start, 'start'),
  markerEnd: resolveEdgeMarkerUrl(style.end, 'end')
})

export const resolveEdgeLabelTextStyle = (
  style: EdgeLabelRenderItem['style']
): CSSProperties => ({
  color: resolvePaletteColorOr(style?.color, 'var(--ui-text-primary)') ?? 'var(--ui-text-primary)',
  background: resolvePaletteColor(style?.bg) ?? style?.bg ?? 'transparent',
  fontSize: style?.size ?? 14,
  fontWeight: style?.weight ?? 400,
  fontStyle: style?.italic ? 'italic' : 'normal'
})

export const resolveActiveLabelOutlineStyle = (
  zoom: number
): CSSProperties => ({
  boxShadow: `0 0 0 ${1 / Math.max(zoom, 0.0001)}px var(--ui-accent)`
})

export const renderEdgeLabelMaskTransform = (
  label: Pick<EdgeLabelRenderItem, 'maskRect'>
) => edgeApi.label.maskTransform({
  angle: label.maskRect.angle,
  center: label.maskRect.center
})
