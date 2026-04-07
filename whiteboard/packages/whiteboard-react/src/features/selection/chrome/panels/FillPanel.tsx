import { Slider } from '@ui'
import { COLOR_OPTIONS } from '../menus/options'
import { Panel, PanelSection, SwatchButton } from './ShapeToolbarPrimitives'

const formatPercent = (
  value: number
) => `${Math.round(value * 100)}%`

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
        <div className="flex flex-col gap-2">
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={fillOpacity ?? 1}
            formatValue={formatPercent}
            onValueChange={onFillOpacityChange}
            onValueCommit={onFillOpacityChange}
          />
          <div className="text-right text-xs font-medium text-fg-muted">
            {formatPercent(fillOpacity ?? 1)}
          </div>
        </div>
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
