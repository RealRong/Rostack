import {
  Folder,
  PencilLine,
  Square,
  Shapes,
  StickyNote,
  Type,
  type LucideIcon
} from 'lucide-react'
import { node as nodeApi } from '@whiteboard/core/node'
import { product } from '@whiteboard/product'
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
  if (nodeApi.shape.isKind(icon)) {
    return (
      <ShapeGlyph
        kind={icon}
        size={size}
        strokeWidth={strokeWidth}
        fill={product.node.shapes.readWhiteboardShapePreviewFill(icon)}
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
