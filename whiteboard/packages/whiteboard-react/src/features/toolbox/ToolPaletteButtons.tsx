import {
  Eraser,
  GitBranch,
  Hand,
  Highlighter,
  MousePointer2,
  PencilLine,
  StickyNote,
  Type,
  type LucideIcon
} from 'lucide-react'
import {
  type DrawKind,
  type Tool
} from '@whiteboard/editor'
import { readShapePreviewFill } from '@whiteboard/core/node'
import type {
  ToolPaletteView
} from '../../types/toolbox'
import {
  ShapeGlyph
} from '../node/shape'
import { EdgePresetGlyph } from './menus/EdgeMenu'
import { TEXT_INSERT_PRESET } from './presets'
import type { ToolPaletteController } from './controller'

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

const DRAW_KIND_ICON = {
  pen: PencilLine,
  highlighter: Highlighter,
  eraser: Eraser
} as const satisfies Record<DrawKind, typeof PencilLine>

export const ToolPaletteButtons = ({
  tool,
  palette,
  controller,
  buttonRefByKey
}: {
  tool: Tool
  palette: ToolPaletteView
  controller: ToolPaletteController
  buttonRefByKey: {
    current: Partial<Record<'draw' | 'edge' | 'sticky' | 'shape' | 'mindmap', HTMLButtonElement | null>>
  }
}) => {
  const DrawButtonIcon = DRAW_KIND_ICON[palette.drawKind]
  const toolIcon = tool.type === 'hand' ? Hand : MousePointer2

  return (
    <div className="wb-left-toolbar">
      <button
        type="button"
        className="wb-left-toolbar-button"
        data-active={tool.type === 'select' || tool.type === 'hand' ? 'true' : undefined}
        onClick={controller.togglePrimaryTool}
        data-selection-ignore
        data-input-ignore
        title={tool.type === 'hand' ? 'Hand' : 'Select'}
      >
        <ToolIcon icon={toolIcon} />
      </button>
      <div className="wb-left-toolbar-divider" />
      <button
        ref={(element) => {
          buttonRefByKey.current.edge = element
        }}
        type="button"
        className="wb-left-toolbar-button"
        data-active={tool.type === 'edge' ? 'true' : undefined}
        onClick={controller.toggleEdgeMenu}
        data-selection-ignore
        data-input-ignore
        title="Edge"
      >
        <span className="wb-left-toolbar-button-edge-preview">
          <EdgePresetGlyph preset={palette.edgePreset} />
        </span>
      </button>
      <button
        ref={(element) => {
          buttonRefByKey.current.sticky = element
        }}
        type="button"
        className="wb-left-toolbar-button"
        data-active={palette.insertGroup === 'sticky' ? 'true' : undefined}
        onClick={() => {
          controller.toggleInsertMenu('sticky')
        }}
        data-selection-ignore
        data-input-ignore
        title="Sticky note"
      >
        <span
          className="wb-left-toolbar-button-tint"
          style={{
            background: palette.stickyTone?.fill
          }}
        />
        <ToolIcon icon={StickyNote} />
      </button>
      <button
        type="button"
        className="wb-left-toolbar-button"
        data-active={tool.type === 'insert' && tool.preset === TEXT_INSERT_PRESET.key ? 'true' : undefined}
        onClick={controller.activateTextTool}
        data-selection-ignore
        data-input-ignore
        title="Text"
      >
        <ToolIcon icon={Type} />
      </button>
      <button
        ref={(element) => {
          buttonRefByKey.current.shape = element
        }}
        type="button"
        className="wb-left-toolbar-button"
        data-active={palette.insertGroup === 'shape' ? 'true' : undefined}
        onClick={() => {
          controller.toggleInsertMenu('shape')
        }}
        data-selection-ignore
        data-input-ignore
        title="Shapes"
      >
        {palette.shapeKind ? (
          <span className="wb-left-toolbar-button-shape-preview">
            <ShapeGlyph
              kind={palette.shapeKind}
              width={22}
              height={22}
              strokeWidth={4}
              fill={readShapePreviewFill(palette.shapeKind)}
              stroke="currentColor"
            />
          </span>
        ) : null}
      </button>
      <button
        ref={(element) => {
          buttonRefByKey.current.draw = element
        }}
        type="button"
        className="wb-left-toolbar-button"
        data-active={tool.type === 'draw' ? 'true' : undefined}
        onClick={controller.toggleDrawMenu}
        data-selection-ignore
        data-input-ignore
        title="Draw"
      >
        {palette.drawButtonStyle ? (
          <span
            className="wb-left-toolbar-button-tint"
            style={{
              background: palette.drawButtonStyle.color,
              opacity: palette.drawButtonStyle.opacity
            }}
          />
        ) : null}
        <ToolIcon icon={DrawButtonIcon} />
      </button>
      <button
        ref={(element) => {
          buttonRefByKey.current.mindmap = element
        }}
        type="button"
        className="wb-left-toolbar-button"
        data-active={palette.insertGroup === 'mindmap' ? 'true' : undefined}
        onClick={() => {
          controller.toggleInsertMenu('mindmap')
        }}
        data-selection-ignore
        data-input-ignore
        title="Mindmap"
      >
        <ToolIcon icon={GitBranch} />
      </button>
    </div>
  )
}
