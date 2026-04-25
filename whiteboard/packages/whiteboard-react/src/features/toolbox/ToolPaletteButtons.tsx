import { memo } from 'react'
import {
  Eraser,
  GitBranch,
  Hand,
  Highlighter,
  MousePointer2,
  Pencil,
  StickyNote,
  Type,
  type LucideIcon
} from 'lucide-react'
import {
  FloatingSurface,
  PickerDivider,
  PickerIconButton
} from '@shared/ui'
import {
  type Tool
} from '@whiteboard/editor'
import type {
  DrawMode
} from '@whiteboard/editor'
import { product } from '@whiteboard/product'
import type {
  ToolPaletteView
} from '@whiteboard/react/types/toolbox'
import {
  ShapeGlyph
} from '@whiteboard/react/features/node'
import { EdgePresetGlyph } from '@whiteboard/react/features/toolbox/menus/EdgeMenu'
import type { ToolPaletteController } from '@whiteboard/react/features/toolbox/controller'

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
  pen: Pencil,
  highlighter: Highlighter,
  eraser: Eraser
} as const satisfies Record<DrawMode, typeof Pencil>

export const ToolPaletteButtons = memo(({
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
      className="absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 p-1.5"
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
        <ToolIcon icon={StickyNote} />
      </PickerIconButton>
      <PickerIconButton
        type="button"
        pressed={
          tool.type === 'insert'
          && tool.template.kind === product.insert.catalog.WHITEBOARD_TEXT_INSERT_PRESET.template.kind
          && tool.template.kind === 'node'
          && tool.template.template.type === 'text'
        }
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
              fill={product.node.shapes.readWhiteboardShapePreviewFill(palette.shapeKind)}
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
})

ToolPaletteButtons.displayName = 'ToolPaletteButtons'
