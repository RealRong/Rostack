import {
  Minus,
  Plus,
  Redo2,
  Scan,
  Undo2,
  type LucideIcon
} from 'lucide-react'
import { useStoreValue } from '@shared/react'
import { Button, cn } from '@ui'
import { useEditor } from '#react/runtime/hooks'

const ZOOM_FACTOR = 1.2
const iconButtonClassName = cn(
  'h-9 w-9 rounded-[10px] text-fg-muted hover:text-fg'
)
const zoomButtonClassName = cn(
  'h-9 min-w-[58px] rounded-[10px] px-2.5 text-sm font-medium text-fg-muted hover:text-fg'
)

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
  const viewport = useStoreValue(editor.select.viewport())
  const history = useStoreValue(editor.select.history())

  const fitToScreen = () => {
    const bounds = editor.select.doc.bounds()
    if (!bounds) {
      return
    }
    editor.actions.viewport.fit(bounds)
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[var(--wb-z-toolbar)] overflow-visible"
    >
      <div className="pointer-events-auto absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-xl border border-[rgb(from_var(--ui-border-subtle)_r_g_b_/_0.4)] bg-floating p-1.5 shadow-popover">
        <div className="inline-flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            className={iconButtonClassName}
            onClick={() => {
              editor.actions.history.undo()
            }}
            disabled={!history.canUndo || history.isApplying}
            title="Undo"
          >
            <ToolIcon icon={Undo2} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={iconButtonClassName}
            onClick={() => {
              editor.actions.history.redo()
            }}
            disabled={!history.canRedo || history.isApplying}
            title="Redo"
          >
            <ToolIcon icon={Redo2} />
          </Button>
        </div>
        <div className="self-stretch border-l border-divider" />
        <div className="inline-flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            className={iconButtonClassName}
            onClick={fitToScreen}
            title="Fit to screen"
          >
            <ToolIcon icon={Scan} />
          </Button>
        </div>
        <div className="self-stretch border-l border-divider" />
        <div className="inline-flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            className={iconButtonClassName}
            onClick={() => {
              editor.actions.viewport.zoomTo(viewport.zoom / ZOOM_FACTOR)
            }}
            title="Zoom out"
          >
            <ToolIcon icon={Minus} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={zoomButtonClassName}
            onClick={() => {
              editor.actions.viewport.zoomTo(1)
            }}
            title="Reset zoom"
          >
            {formatZoom(viewport.zoom)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={iconButtonClassName}
            onClick={() => {
              editor.actions.viewport.zoomTo(viewport.zoom * ZOOM_FACTOR)
            }}
            title="Zoom in"
          >
            <ToolIcon icon={Plus} />
          </Button>
        </div>
      </div>
    </div>
  )
}
