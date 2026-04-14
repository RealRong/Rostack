import type { DrawPreview as DrawPreviewValue } from '@whiteboard/editor/draw'
import { DrawStrokeShape } from '@whiteboard/react/features/draw/stroke'
import { resolvePaletteColor } from '@whiteboard/react/features/palette'

export const DrawPreview = ({
  preview
}: {
  preview: DrawPreviewValue | null
}) => {
  if (!preview || preview.points.length === 0) {
    return null
  }

  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-draw-preview-layer"
      aria-hidden="true"
    >
      <DrawStrokeShape
        points={preview.points}
        color={resolvePaletteColor(preview.style.color) ?? preview.style.color}
        width={preview.style.width}
        opacity={preview.style.opacity}
      />
    </svg>
  )
}
