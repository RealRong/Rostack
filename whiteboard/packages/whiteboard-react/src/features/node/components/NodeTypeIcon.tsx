import {
  Folder,
  PencilLine,
  Square,
  Shapes,
  StickyNote,
  Type,
  type LucideIcon
} from 'lucide-react'
import {
  isShapeKind,
  readShapePreviewFill
} from '@whiteboard/core/node'
import {
  ShapeGlyph
} from '@whiteboard/react/features/node/shape'

const IconByName: Record<string, LucideIcon> = {
  text: Type,
  sticky: StickyNote,
  group: Folder,
  frame: Square,
  draw: PencilLine
}

export const NodeTypeIcon = ({
  icon,
  size = 14,
  strokeWidth = 1.5,
  className
}: {
  icon: string
  size?: number
  strokeWidth?: number
  className?: string
}) => {
  if (isShapeKind(icon)) {
    return (
      <ShapeGlyph
        kind={icon}
        size={size}
        strokeWidth={strokeWidth}
        fill={readShapePreviewFill(icon)}
        className={className}
      />
    )
  }

  const Icon = IconByName[icon] ?? Shapes

  return (
    <Icon
      size={size}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      className={className}
      aria-hidden="true"
    />
  )
}
