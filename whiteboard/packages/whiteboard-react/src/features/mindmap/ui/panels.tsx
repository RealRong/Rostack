import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SegmentedButton,
  SliderSection
} from '@shared/ui'
import type {
  MindmapNodeFrameKind
} from '@whiteboard/core/types'
import type {
  MindmapBranchLineKind,
  MindmapStrokeStyle
} from '@whiteboard/core/mindmap'
import { WHITEBOARD_MINDMAP_UI } from '@whiteboard/product'
import {
  WHITEBOARD_FILL_COLOR_OPTIONS,
  WHITEBOARD_LINE_COLOR_OPTIONS,
  WHITEBOARD_PALETTE_GRID_COLUMNS,
  WHITEBOARD_PALETTE_SWATCH_SHAPE,
  WHITEBOARD_STROKE_COLOR_OPTIONS
} from '@whiteboard/react/features/palette'

const strokeDasharray = (
  stroke: MindmapStrokeStyle
) => {
  switch (stroke) {
    case 'dashed':
      return '6 4'
    case 'dotted':
      return '2 4'
    default:
      return undefined
  }
}

const BranchGlyph = ({
  line,
  stroke
}: {
  line: MindmapBranchLineKind
  stroke: MindmapStrokeStyle
}) => {
  const path = line === 'curve'
    ? 'M4 16 C12 16, 12 8, 20 8'
    : line === 'rail'
      ? 'M4 16 L10 16 L10 8 L20 8'
      : 'M4 16 L12 16 L12 8 L20 8'

  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none">
      <path
        d={path}
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray={strokeDasharray(stroke)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const BorderGlyph = ({
  kind
}: {
  kind: MindmapNodeFrameKind
}) => (
  <svg viewBox="0 0 24 24" className="size-6" fill="none">
    {kind === 'underline' ? (
      <path
        d="M4 17 H20"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    ) : kind === 'ellipse' ? (
      <rect
        x={4}
        y={6}
        width={16}
        height={12}
        rx={6}
        stroke="currentColor"
        strokeWidth={2}
      />
    ) : (
      <rect
        x={4}
        y={6}
        width={16}
        height={12}
        rx={2}
        stroke="currentColor"
        strokeWidth={2}
      />
    )}
  </svg>
)

export const MindmapBranchPanel = ({
  color,
  line,
  width,
  stroke,
  onColorChange,
  onLineChange,
  onWidthChange,
  onStrokeChange
}: {
  color?: string
  line?: MindmapBranchLineKind
  width?: number
  stroke?: MindmapStrokeStyle
  onColorChange: (value: string) => void
  onLineChange: (value: MindmapBranchLineKind) => void
  onWidthChange: (value: number) => void
  onStrokeChange: (value: MindmapStrokeStyle) => void
}) => (
  <Panel className="min-w-[260px]">
    <PanelSection title="Branch">
      <div className="flex items-center gap-2">
        {WHITEBOARD_MINDMAP_UI.branchLines.map((option) => (
          <SegmentedButton
            key={option.value}
            active={(line ?? 'curve') === option.value}
            onClick={() => onLineChange(option.value)}
            title={option.label}
          >
            <BranchGlyph
              line={option.value}
              stroke={stroke ?? 'solid'}
            />
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
    <PanelSection title="Style">
      <div className="flex items-center gap-2">
        {WHITEBOARD_MINDMAP_UI.branchStrokes.map((option) => (
          <SegmentedButton
            key={option.value}
            active={(stroke ?? 'solid') === option.value}
            onClick={() => onStrokeChange(option.value)}
            title={option.label}
          >
            <BranchGlyph
              line={line ?? 'curve'}
              stroke={option.value}
            />
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
    <SliderSection
      title="Width"
      min={1}
      max={16}
      step={1}
      value={width ?? 2}
      onChange={onWidthChange}
    />
    <PanelSection title="Color">
      <ColorSwatchGrid
        options={WHITEBOARD_LINE_COLOR_OPTIONS}
        value={color}
        onChange={onColorChange}
        columns={WHITEBOARD_PALETTE_GRID_COLUMNS}
        swatchShape={WHITEBOARD_PALETTE_SWATCH_SHAPE}
      />
    </PanelSection>
  </Panel>
)

export const MindmapBorderPanel = ({
  kind,
  stroke,
  strokeWidth,
  fill,
  onKindChange,
  onStrokeChange,
  onStrokeWidthChange,
  onFillChange
}: {
  kind?: MindmapNodeFrameKind
  stroke?: string
  strokeWidth?: number
  fill?: string
  onKindChange: (value: MindmapNodeFrameKind) => void
  onStrokeChange: (value: string) => void
  onStrokeWidthChange: (value: number) => void
  onFillChange: (value: string) => void
}) => (
  <Panel className="min-w-[260px]">
    <PanelSection title="Border">
      <div className="flex items-center gap-2">
        {WHITEBOARD_MINDMAP_UI.borderKinds.map((option) => (
          <SegmentedButton
            key={option.value}
            active={(kind ?? 'rect') === option.value}
            onClick={() => onKindChange(option.value)}
            title={option.label}
          >
            <BorderGlyph kind={option.value} />
          </SegmentedButton>
        ))}
      </div>
    </PanelSection>
    <SliderSection
      title="Width"
      min={0}
      max={16}
      step={1}
      value={strokeWidth ?? 0}
      onChange={onStrokeWidthChange}
    />
    <PanelSection title="Border color">
      <ColorSwatchGrid
        options={WHITEBOARD_STROKE_COLOR_OPTIONS}
        value={stroke}
        onChange={onStrokeChange}
        columns={WHITEBOARD_PALETTE_GRID_COLUMNS}
        swatchShape={WHITEBOARD_PALETTE_SWATCH_SHAPE}
      />
    </PanelSection>
    <PanelSection title="Fill">
      <ColorSwatchGrid
        options={WHITEBOARD_FILL_COLOR_OPTIONS}
        value={fill}
        onChange={onFillChange}
        columns={WHITEBOARD_PALETTE_GRID_COLUMNS}
        swatchShape={WHITEBOARD_PALETTE_SWATCH_SHAPE}
      />
    </PanelSection>
  </Panel>
)
