import type { CSSProperties } from 'react'
import { memo, useMemo } from 'react'
import { usePickRef } from '#react/runtime/hooks'
import { EDGE_ARROW_END_ID, EDGE_ARROW_START_ID, resolveEdgeDash } from '../constants'
import type { EdgeView } from '#react/types/edge'

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

  const { stroke, strokeWidth, dash, markerStart, markerEnd, hitWidth } = useMemo(() => {
    const baseStroke = edge.style?.color ?? 'var(--ui-text-primary)'
    const stroke = selected ? 'var(--ui-accent)' : baseStroke
    const baseWidth = edge.style?.width ?? 2
    const strokeWidth = selected ? Math.max(baseWidth, 3) : baseWidth
    const dash = resolveEdgeDash(edge.style?.dash)
    const markerStart = resolveMarker(edge.style?.start, EDGE_ARROW_START_ID)
    const markerEnd = resolveMarker(edge.style?.end, EDGE_ARROW_END_ID)
    const hitWidth = Math.max(6, strokeWidth + hitTestThresholdScreen)

    return {
      stroke,
      strokeWidth,
      dash,
      markerStart,
      markerEnd,
      hitWidth
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
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
        className="wb-edge-hover-path"
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
      />
    </g>
  )
}

export const EdgeItem = memo(EdgeItemBase)

EdgeItem.displayName = 'EdgeItem'
