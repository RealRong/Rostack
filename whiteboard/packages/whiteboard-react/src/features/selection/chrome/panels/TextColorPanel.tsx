import { TEXT_COLOR_OPTIONS } from '../menus/options'
import { Panel, PanelSection, SwatchButton } from './ShapeToolbarPrimitives'

export const TextColorPanel = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <Panel className="min-w-[240px]">
    <PanelSection title="Text color">
      <div className="grid grid-cols-5 gap-2">
        {TEXT_COLOR_OPTIONS.map((option) => (
          <SwatchButton
            key={option.value}
            color={option.value}
            active={value === option.value}
            onClick={() => onChange(option.value)}
          />
        ))}
      </div>
    </PanelSection>
  </Panel>
)
