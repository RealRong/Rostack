import { ColorSwatchGrid, Panel, PanelSection } from '@shared/ui'
import {
  WHITEBOARD_PALETTE_GRID_COLUMNS,
  WHITEBOARD_PALETTE_SWATCH_SHAPE,
  WHITEBOARD_TEXT_COLOR_OPTIONS
} from '@whiteboard/react/features/palette'

export const TextColorPanel = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <Panel>
    <PanelSection title="Text color">
      <ColorSwatchGrid
        options={WHITEBOARD_TEXT_COLOR_OPTIONS}
        value={value}
        onChange={onChange}
        columns={WHITEBOARD_PALETTE_GRID_COLUMNS}
        swatchShape={WHITEBOARD_PALETTE_SWATCH_SHAPE}
      />
    </PanelSection>
  </Panel>
)
