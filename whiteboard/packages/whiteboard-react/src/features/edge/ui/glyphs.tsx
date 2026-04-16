import type { ComponentProps } from 'react'
import type {
  EdgeDash,
  EdgeType
} from '@whiteboard/core/types'
import {
  resolvePaletteColor
} from '@whiteboard/react/features/palette'

type EdgeGlyphProps = ComponentProps<'svg'>

const readEdgeDashArray = (
  value: EdgeDash | undefined
) => {
  if (value === 'dashed') {
    return '8 6'
  }
  if (value === 'dotted') {
    return '2 4'
  }

  return undefined
}

export const EdgeLineGlyph = ({
  type = 'straight',
  dash = 'solid',
  color,
  opacity = 1,
  className = 'size-6',
  ...props
}: EdgeGlyphProps & {
  type?: EdgeType
  dash?: EdgeDash
  color?: string
  opacity?: number
}) => {
  const stroke = resolvePaletteColor(color) ?? color ?? 'currentColor'
  const dashArray = readEdgeDashArray(dash)

  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      {...props}
    >
      {type === 'curve' ? (
        <path
          d="M4 18 C9 4, 15 20, 20 6"
          stroke={stroke}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          opacity={opacity}
        />
      ) : type === 'fillet' ? (
        <path
          d="M4 18 H11 Q14 18 14 15 V6 H20"
          stroke={stroke}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      ) : type === 'elbow' ? (
        <path
          d="M4 18 H12 V6 H20"
          stroke={stroke}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      ) : (
        <path
          d="M4 18 L20 6"
          stroke={stroke}
          strokeWidth={1.8}
          strokeDasharray={dashArray}
          strokeLinecap="round"
          opacity={opacity}
        />
      )}
    </svg>
  )
}
