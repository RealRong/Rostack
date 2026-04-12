import { TEXT_COLOR_OPTIONS } from '../menus/options'
import { ColorSwatchGrid, Panel, PanelSection } from './ShapeToolbarPrimitives'

export const TextColorPanel = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <Panel className="min-w-[240px]">
    <PanelSection title="Text color">
      <ColorSwatchGrid
        options={TEXT_COLOR_OPTIONS}
        value={value}
        onChange={onChange}
      />
    </PanelSection>
  </Panel>
)
