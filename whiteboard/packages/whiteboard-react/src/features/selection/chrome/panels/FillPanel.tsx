import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SliderSection,
  formatPercent
} from '@shared/ui'
import {
  WHITEBOARD_PALETTE_GRID_COLUMNS,
  WHITEBOARD_PALETTE_SWATCH_SHAPE
} from '@whiteboard/react/features/palette'

export const FillPanel = ({
  fill,
  fillOpacity,
  options,
  onFillChange,
  onFillOpacityChange
}: {
  fill?: string
  fillOpacity?: number
  options: readonly {
    value: string
    color?: string
    ariaLabel?: string
    transparent?: boolean
  }[]
  onFillChange: (value: string) => void
  onFillOpacityChange?: (value: number) => void
}) => (
  <Panel>
    {onFillOpacityChange ? (
      <>
        <SliderSection
          title="Opacity"
          min={0}
          max={1}
          step={0.05}
          value={fillOpacity ?? 1}
          formatValue={formatPercent}
          onChange={onFillOpacityChange}
        />
      </>
    ) : null}
    <PanelSection title="Color">
      <ColorSwatchGrid
        options={options}
        value={fill}
        onChange={onFillChange}
        columns={WHITEBOARD_PALETTE_GRID_COLUMNS}
        swatchShape={WHITEBOARD_PALETTE_SWATCH_SHAPE}
      />
    </PanelSection>
  </Panel>
)
