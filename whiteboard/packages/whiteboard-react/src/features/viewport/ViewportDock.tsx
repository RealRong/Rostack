import {
  Minus,
  Plus,
  Redo2,
  Scan,
  Undo2,
  type LucideIcon
} from 'lucide-react'
import {
  FloatingLayer,
  ToolbarBar,
  ToolbarButton,
  ToolbarDivider,
  ToolbarIconButton
} from '@shared/ui'
import { useStoreValue } from '@shared/react'
import { useEditor } from '@whiteboard/react/runtime/hooks'

const ZOOM_FACTOR = 1.2
const iconButtonClassName = 'text-fg-muted hover:text-fg'
const zoomButtonClassName = 'min-w-[58px] px-2.5 text-fg-muted hover:text-fg'

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
  const zoom = useStoreValue(editor.state.viewport.zoom)
  const history = useStoreValue(editor.history)

  const fitToScreen = () => {
    const bounds = editor.scene.query.bounds()
    if (!bounds) {
      return
    }
    editor.write.viewport.fit(bounds)
  }

  return (
    <FloatingLayer className="z-[var(--wb-z-toolbar)]">
      <ToolbarBar
        className="absolute bottom-4 right-4 gap-2 rounded-xl p-1.5"
        onPointerDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div className="inline-flex items-center gap-0.5">
          <ToolbarIconButton
            type="button"
            className={iconButtonClassName}
            onClick={() => {
              editor.write.history.undo()
            }}
            disabled={!history.canUndo || history.isApplying}
            title="Undo"
          >
            <ToolIcon icon={Undo2} />
          </ToolbarIconButton>
          <ToolbarIconButton
            type="button"
            className={iconButtonClassName}
            onClick={() => {
              editor.write.history.redo()
            }}
            disabled={!history.canRedo || history.isApplying}
            title="Redo"
          >
            <ToolIcon icon={Redo2} />
          </ToolbarIconButton>
        </div>
        <ToolbarDivider />
        <div className="inline-flex items-center gap-0.5">
          <ToolbarIconButton
            type="button"
            className={iconButtonClassName}
            onClick={fitToScreen}
            title="Fit to screen"
          >
            <ToolIcon icon={Scan} />
          </ToolbarIconButton>
        </div>
        <ToolbarDivider />
        <div className="inline-flex items-center gap-0.5">
          <ToolbarIconButton
            type="button"
            className={iconButtonClassName}
            onClick={() => {
              editor.write.viewport.zoomTo(zoom / ZOOM_FACTOR)
            }}
            title="Zoom out"
          >
            <ToolIcon icon={Minus} />
          </ToolbarIconButton>
          <ToolbarButton
            type="button"
            className={zoomButtonClassName}
            onClick={() => {
              editor.write.viewport.zoomTo(1)
            }}
            title="Reset zoom"
          >
            {formatZoom(zoom)}
          </ToolbarButton>
          <ToolbarIconButton
            type="button"
            className={iconButtonClassName}
            onClick={() => {
              editor.write.viewport.zoomTo(zoom * ZOOM_FACTOR)
            }}
            title="Zoom in"
          >
            <ToolIcon icon={Plus} />
          </ToolbarIconButton>
        </div>
      </ToolbarBar>
    </FloatingLayer>
  )
}
