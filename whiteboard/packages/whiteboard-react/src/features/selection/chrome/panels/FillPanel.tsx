import { Slider } from '@ui'
import { COLOR_OPTIONS } from '../menus/options'
import { Panel, PanelSection, SwatchButton } from './ShapeToolbarPrimitives'

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
      <PanelSection title="Opacity">
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={fillOpacity ?? 1}
          formatValue={(value) => `${Math.round(value * 100)}%`}
          showValue
          onValueChange={onFillOpacityChange}
          onValueCommit={onFillOpacityChange}
        />
      </PanelSection>
    ) : null}
    <PanelSection title="Color">
      <div className="grid grid-cols-5 gap-2">
        {COLOR_OPTIONS.map((option) => (
          <SwatchButton
            key={option.value}
            color={option.value}
            active={fill === option.value}
            onClick={() => onFillChange(option.value)}
          />
        ))}
      </div>
    </PanelSection>
  </Panel>
)
