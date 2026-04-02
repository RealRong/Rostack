import {
  Minus,
  Plus,
  Redo2,
  Scan,
  Undo2,
  type LucideIcon
} from 'lucide-react'
import { useEditor } from '../../runtime/hooks/useEditor'
import { useStoreValue } from '../../runtime/hooks/useStoreValue'

const ZOOM_FACTOR = 1.2

const ToolIcon = ({
  icon: Icon
}: {
  icon: LucideIcon
}) => (
  <Icon
    size={18}
    strokeWidth={1}
    absoluteStrokeWidth
  />
)

const formatZoom = (zoom: number) => `${Math.round(zoom * 100)}%`

export const ViewportDock = () => {
  const editor = useEditor()
  const viewport = useStoreValue(editor.state.viewport)
  const history = useStoreValue(editor.read.history)

  const fitToScreen = () => {
    const bounds = editor.read.document.bounds()
    if (!bounds) {
      return
    }
    editor.commands.viewport.fit(bounds)
  }

  return (
    <div
      className="wb-canvas-dock-layer"
      data-selection-ignore
      data-input-ignore
    >
      <div className="wb-canvas-dock">
        <div className="wb-canvas-dock-group">
          <button
            type="button"
            className="wb-canvas-dock-button"
            onClick={() => {
              editor.commands.history.undo()
            }}
            disabled={!history.canUndo || history.isApplying}
            title="Undo"
            data-selection-ignore
            data-input-ignore
          >
            <ToolIcon icon={Undo2} />
          </button>
          <button
            type="button"
            className="wb-canvas-dock-button"
            onClick={() => {
              editor.commands.history.redo()
            }}
            disabled={!history.canRedo || history.isApplying}
            title="Redo"
            data-selection-ignore
            data-input-ignore
          >
            <ToolIcon icon={Redo2} />
          </button>
        </div>
        <div className="wb-canvas-dock-divider" />
        <div className="wb-canvas-dock-group">
          <button
            type="button"
            className="wb-canvas-dock-button"
            onClick={fitToScreen}
            title="Fit to screen"
            data-selection-ignore
            data-input-ignore
          >
            <ToolIcon icon={Scan} />
          </button>
        </div>
        <div className="wb-canvas-dock-divider" />
        <div className="wb-canvas-dock-group">
          <button
            type="button"
            className="wb-canvas-dock-button"
            onClick={() => {
              editor.commands.viewport.zoomTo(viewport.zoom / ZOOM_FACTOR)
            }}
            title="Zoom out"
            data-selection-ignore
            data-input-ignore
          >
            <ToolIcon icon={Minus} />
          </button>
          <button
            type="button"
            className="wb-canvas-dock-zoom"
            onClick={() => {
              editor.commands.viewport.zoomTo(1)
            }}
            title="Reset zoom"
            data-selection-ignore
            data-input-ignore
          >
            {formatZoom(viewport.zoom)}
          </button>
          <button
            type="button"
            className="wb-canvas-dock-button"
            onClick={() => {
              editor.commands.viewport.zoomTo(viewport.zoom * ZOOM_FACTOR)
            }}
            title="Zoom in"
            data-selection-ignore
            data-input-ignore
          >
            <ToolIcon icon={Plus} />
          </button>
        </div>
      </div>
    </div>
  )
}
