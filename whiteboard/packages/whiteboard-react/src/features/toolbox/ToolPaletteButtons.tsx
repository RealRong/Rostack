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
  FloatingSurface,
  PickerDivider,
  PickerIconButton,
  PickerTintBar
} from '@shared/ui'
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
    <FloatingSurface
      variant="compact"
      className="absolute left-4 top-4 flex w-[52px] flex-col gap-1 p-1.5"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <PickerIconButton
        type="button"
        pressed={tool.type === 'select' || tool.type === 'hand'}
        onClick={controller.togglePrimaryTool}
        title={tool.type === 'hand' ? 'Hand' : 'Select'}
      >
        <ToolIcon icon={toolIcon} />
      </PickerIconButton>
      <PickerDivider />
      <PickerIconButton
        ref={(element) => {
          buttonRefByKey.current.edge = element
        }}
        type="button"
        pressed={tool.type === 'edge'}
        onClick={controller.toggleEdgeMenu}
        title="Edge"
      >
        <span className="inline-flex h-[22px] w-[22px] items-center justify-center text-current">
          <EdgePresetGlyph preset={palette.edgePreset} />
        </span>
      </PickerIconButton>
      <PickerIconButton
        ref={(element) => {
          buttonRefByKey.current.sticky = element
        }}
        type="button"
        pressed={palette.insertGroup === 'sticky'}
        onClick={() => {
          controller.toggleInsertMenu('sticky')
        }}
        title="Sticky note"
      >
        <PickerTintBar
          style={{
            background: palette.stickyTone?.fill
          }}
        />
        <ToolIcon icon={StickyNote} />
      </PickerIconButton>
      <PickerIconButton
        type="button"
        pressed={tool.type === 'insert' && tool.preset === TEXT_INSERT_PRESET.key}
        onClick={controller.activateTextTool}
        title="Text"
      >
        <ToolIcon icon={Type} />
      </PickerIconButton>
      <PickerIconButton
        ref={(element) => {
          buttonRefByKey.current.shape = element
        }}
        type="button"
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
      </PickerIconButton>
      <PickerIconButton
        ref={(element) => {
          buttonRefByKey.current.draw = element
        }}
        type="button"
        pressed={tool.type === 'draw'}
        onClick={controller.toggleDrawMenu}
        title="Draw"
      >
        {palette.drawButtonStyle ? (
          <PickerTintBar
            style={{
              background: palette.drawButtonStyle.color,
              opacity: palette.drawButtonStyle.opacity
            }}
          />
        ) : null}
        <ToolIcon icon={DrawButtonIcon} />
      </PickerIconButton>
      <PickerIconButton
        ref={(element) => {
          buttonRefByKey.current.mindmap = element
        }}
        type="button"
        pressed={palette.insertGroup === 'mindmap'}
        onClick={() => {
          controller.toggleInsertMenu('mindmap')
        }}
        title="Mindmap"
      >
        <ToolIcon icon={GitBranch} />
      </PickerIconButton>
    </FloatingSurface>
  )
}
