import type { CSSProperties } from 'react'
import { memo, useMemo } from 'react'
import { usePickRef } from '../../../runtime/hooks/usePickRef'
import { EDGE_ARROW_END_ID, EDGE_ARROW_START_ID, EDGE_DASH_ANIMATION } from '../constants'
import type { EdgeView } from '../../../types/edge'

type EdgeItemProps = {
  entry: EdgeView
  hitTestThresholdScreen: number
  selected?: boolean
}

const resolveMarker = (value: string | undefined, fallbackId: string) => {
  if (!value) return undefined
  if (value.startsWith('url(')) return value
  if (value === 'arrow') return `url(#${fallbackId})`
  return `url(#${value})`
}

const EdgeItemBase = ({
  entry,
  hitTestThresholdScreen,
  selected
}: EdgeItemProps) => {
  const edge = entry.edge
  const ref = usePickRef({
    kind: 'edge',
    id: edge.id,
    part: 'body'
  })
  const svgPath = entry.path.svgPath

  const { stroke, strokeWidth, dash, markerStart, markerEnd, hitWidth, animation } = useMemo(() => {
    const baseStroke = edge.style?.stroke ?? 'hsl(var(--ui-text-primary, 40 2.1% 28%))'
    const stroke = selected ? 'hsl(var(--ui-accent, 209.8 76.7% 51.2%))' : baseStroke
    const baseWidth = edge.style?.strokeWidth ?? 2
    const strokeWidth = selected ? Math.max(baseWidth, 3) : baseWidth
    const isAnimated = Boolean(edge.style?.animated)
    const dashArray = edge.style?.dash ?? (isAnimated ? [6, 4] : undefined)
    const dash = dashArray?.join(' ')
    const animationDuration = Math.max(0.3, edge.style?.animationSpeed ?? 1.2)
    const markerStart = resolveMarker(edge.style?.markerStart, EDGE_ARROW_START_ID)
    const markerEnd = resolveMarker(edge.style?.markerEnd, EDGE_ARROW_END_ID)
    const hitWidth = Math.max(6, strokeWidth + hitTestThresholdScreen)
    const animation = isAnimated ? `${EDGE_DASH_ANIMATION} ${animationDuration}s linear infinite` : undefined

    return {
      stroke,
      strokeWidth,
      dash,
      markerStart,
      markerEnd,
      hitWidth,
      animation
    }
  }, [edge, hitTestThresholdScreen, selected])

  const hoverStrokeWidth = selected ? strokeWidth : strokeWidth + 1

  return (
    <g
      className="wb-edge-item"
      data-edge-id={edge.id}
      data-selected={selected ? 'true' : 'false'}
      style={{ '--wb-edge-hover-stroke-width': `${hoverStrokeWidth}` } as CSSProperties}
    >
      <path
        ref={ref}
        d={svgPath}
        fill="none"
        stroke="transparent"
        strokeWidth={hitWidth}
        vectorEffect="non-scaling-stroke"
        pointerEvents="stroke"
        tabIndex={0}
        className="wb-edge-hit-path"
      />
      <path
        d={svgPath}
        fill="none"
        stroke={stroke}
        color={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dash}
        markerStart={markerStart}
        markerEnd={markerEnd}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
        className="wb-edge-visible-path"
        style={{ animation }}
      />
    </g>
  )
}

export const EdgeItem = memo(EdgeItemBase)

EdgeItem.displayName = 'EdgeItem'
