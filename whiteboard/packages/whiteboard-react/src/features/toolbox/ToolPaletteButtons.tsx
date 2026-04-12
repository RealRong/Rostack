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
  type Tool
} from '@whiteboard/editor'
import type { DrawMode } from '@whiteboard/editor/draw'
import { readShapePreviewFill } from '@whiteboard/core/node'
import type {
  ToolPaletteView
} from '../../types/toolbox'
import {
  ShapeGlyph
} from '#react/features/node'
import { EdgePresetGlyph } from './menus/EdgeMenu'
import { TEXT_INSERT_PRESET } from './presets'
import type { ToolPaletteController } from './controller'
import {
  TOOLBOX_BUTTON_TINT_CLASSNAME,
  TOOLBOX_GRID_BUTTON_CLASSNAME,
  TOOLBOX_ICON_BUTTON_CLASSNAME,
  TOOLBOX_SURFACE_CLASSNAME,
  ToolboxButton
} from './primitives'
import { cn } from '@ui'

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

const DRAW_MODE_ICON = {
  pen: PencilLine,
  highlighter: Highlighter,
  eraser: Eraser
} as const satisfies Record<DrawMode, typeof PencilLine>

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
  const DrawButtonIcon = DRAW_MODE_ICON[palette.drawMode]
  const toolIcon = tool.type === 'hand' ? Hand : MousePointer2

  return (
    <div className={cn(
      TOOLBOX_SURFACE_CLASSNAME,
      'pointer-events-auto absolute left-4 top-4 flex w-[52px] flex-col gap-1 p-1.5'
    )}>
      <ToolboxButton
        type="button"
        className={TOOLBOX_ICON_BUTTON_CLASSNAME}
        pressed={tool.type === 'select' || tool.type === 'hand'}
        onClick={controller.togglePrimaryTool}
        title={tool.type === 'hand' ? 'Hand' : 'Select'}
      >
        <ToolIcon icon={toolIcon} />
      </ToolboxButton>
      <div className="mx-0 my-0.5 h-px w-full bg-[rgb(from_var(--ui-border-subtle)_r_g_b_/_0.4)]" />
      <ToolboxButton
        ref={(element) => {
          buttonRefByKey.current.edge = element
        }}
        type="button"
        className={TOOLBOX_ICON_BUTTON_CLASSNAME}
        pressed={tool.type === 'edge'}
        onClick={controller.toggleEdgeMenu}
        title="Edge"
      >
        <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-current">
          <EdgePresetGlyph preset={palette.edgePreset} />
        </span>
      </ToolboxButton>
      <ToolboxButton
        ref={(element) => {
          buttonRefByKey.current.sticky = element
        }}
        type="button"
        className={TOOLBOX_ICON_BUTTON_CLASSNAME}
        pressed={palette.insertGroup === 'sticky'}
        onClick={() => {
          controller.toggleInsertMenu('sticky')
        }}
        title="Sticky note"
      >
        <span
          className={TOOLBOX_BUTTON_TINT_CLASSNAME}
          style={{
            background: palette.stickyTone?.fill
          }}
        />
        <ToolIcon icon={StickyNote} />
      </ToolboxButton>
      <ToolboxButton
        type="button"
        className={TOOLBOX_ICON_BUTTON_CLASSNAME}
        pressed={tool.type === 'insert' && tool.preset === TEXT_INSERT_PRESET.key}
        onClick={controller.activateTextTool}
        title="Text"
      >
        <ToolIcon icon={Type} />
      </ToolboxButton>
      <ToolboxButton
        ref={(element) => {
          buttonRefByKey.current.shape = element
        }}
        type="button"
        className={TOOLBOX_ICON_BUTTON_CLASSNAME}
        pressed={palette.insertGroup === 'shape'}
        onClick={() => {
          controller.toggleInsertMenu('shape')
        }}
        title="Shapes"
      >
        {palette.shapeKind ? (
          <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-current">
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
      </ToolboxButton>
      <ToolboxButton
        ref={(element) => {
          buttonRefByKey.current.draw = element
        }}
        type="button"
        className={TOOLBOX_ICON_BUTTON_CLASSNAME}
        pressed={tool.type === 'draw'}
        onClick={controller.toggleDrawMenu}
        title="Draw"
      >
        {palette.drawButtonStyle ? (
          <span
            className={TOOLBOX_BUTTON_TINT_CLASSNAME}
            style={{
              background: palette.drawButtonStyle.color,
              opacity: palette.drawButtonStyle.opacity
            }}
          />
        ) : null}
        <ToolIcon icon={DrawButtonIcon} />
      </ToolboxButton>
      <ToolboxButton
        ref={(element) => {
          buttonRefByKey.current.mindmap = element
        }}
        type="button"
        className={TOOLBOX_ICON_BUTTON_CLASSNAME}
        pressed={palette.insertGroup === 'mindmap'}
        onClick={() => {
          controller.toggleInsertMenu('mindmap')
        }}
        title="Mindmap"
      >
        <ToolIcon icon={GitBranch} />
      </ToolboxButton>
    </div>
  )
}
