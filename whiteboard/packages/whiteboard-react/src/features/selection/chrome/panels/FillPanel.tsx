import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SliderSection,
  formatPercent
} from '@rostack/ui'
import { FILL_COLOR_OPTIONS } from '../menus/options'

export const FillPanel = ({
  fill,
  fillOpacity,
  onFillChange,
  onFillOpacityChange
}: {
  fill?: string
  fillOpacity?: number
  onFillChange: (value: string) => void
  onFillOpacityChange?: (value: number) => void
}) => (
  <Panel className="min-w-[260px]">
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
        <div className="flex flex-col gap-2">
          <div className="text-right text-xs font-medium text-fg-muted">
            {formatPercent(fillOpacity ?? 1)}
          </div>
        </div>
      </>
    ) : null}
    <PanelSection title="Color">
      <ColorSwatchGrid
        options={FILL_COLOR_OPTIONS}
        value={fill}
        onChange={onFillChange}
      />
    </PanelSection>
  </Panel>
)
