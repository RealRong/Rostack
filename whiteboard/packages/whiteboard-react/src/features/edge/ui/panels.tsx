import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SegmentedButton,
  SliderSection,
  formatPercent
} from '@shared/ui'
import type {
  EdgeDash,
  EdgeMarker,
  EdgeType
} from '@whiteboard/core/types'
import {
  WHITEBOARD_LINE_COLOR_OPTIONS,
  WHITEBOARD_PALETTE_GRID_COLUMNS,
  WHITEBOARD_PALETTE_SWATCH_SHAPE
} from '@whiteboard/react/features/palette'
import { EDGE_UI } from '@whiteboard/react/features/edge/ui/catalog'

export const EdgeStrokePanel = ({
  color,
  opacity,
  onColorChange,
  onOpacityChange
}: {
  color?: string
  opacity?: number
  onColorChange: (value: string) => void
  onOpacityChange: (value: number) => void
}) => (
  <Panel className="min-w-[260px]">
    <SliderSection
      title="Opacity"
      min={0}
      max={1}
      step={0.05}
      value={opacity ?? 1}
      formatValue={formatPercent}
      onChange={onOpacityChange}
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

export const EdgeGeometryPanel = ({
  type,
  dash,
  width,
  onTypeChange,
  onDashChange,
  onWidthChange
}: {
  type?: EdgeType
  dash?: EdgeDash
  width?: number
  onTypeChange: (value: EdgeType) => void
  onDashChange: (value: EdgeDash) => void
  onWidthChange: (value: number) => void
}) => (
  <Panel className="min-w-[260px]">
    <PanelSection title="Line type">
      <div className="flex items-center gap-2">
        {EDGE_UI.types.map((option) => {
          const Glyph = option.glyph

          return (
            <SegmentedButton
              key={option.value}
              active={(type ?? 'straight') === option.value}
              onClick={() => onTypeChange(option.value)}
              title={option.label}
            >
              <Glyph className="size-6" />
            </SegmentedButton>
          )
        })}
      </div>
    </PanelSection>
    <PanelSection title="Line style">
      <div className="flex items-center gap-2">
        {EDGE_UI.dashes.map((option) => {
          const Glyph = option.glyph

          return (
            <SegmentedButton
              key={option.value}
              active={(dash ?? 'solid') === option.value}
              onClick={() => onDashChange(option.value)}
              title={option.label}
            >
              <Glyph className="size-6" />
            </SegmentedButton>
          )
        })}
      </div>
    </PanelSection>
    <SliderSection
      title="Line width"
      min={1}
      max={16}
      step={1}
      value={width ?? 2}
      onChange={onWidthChange}
    />
  </Panel>
)

export const EdgeMarkerPanel = ({
  side,
  value,
  onChange
}: {
  side: 'start' | 'end'
  value?: EdgeMarker
  onChange: (value: EdgeMarker | undefined) => void
}) => (
  <Panel className="min-w-[280px]">
    <PanelSection title={side === 'start' ? 'Line start' : 'Line end'}>
      <div className="flex flex-wrap gap-2">
        {EDGE_UI.markers[side].map((option) => {
          const Glyph = option.glyph

          return (
            <SegmentedButton
              key={`${side}:${option.key}`}
              active={value === option.value}
              onClick={() => onChange(option.value)}
              title={option.label}
            >
              <Glyph className="size-6" />
            </SegmentedButton>
          )
        })}
      </div>
    </PanelSection>
  </Panel>
)
