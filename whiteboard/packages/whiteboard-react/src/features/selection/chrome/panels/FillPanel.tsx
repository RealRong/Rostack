import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SliderSection,
  formatPercent
} from '@shared/ui'

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
  }[]
  onFillChange: (value: string) => void
  onFillOpacityChange?: (value: number) => void
}) => (
  <Panel className='w-[240px]'>
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
      />
    </PanelSection>
  </Panel>
)
