import {
  ColorSwatch,
  MenuSection
} from './MenuPrimitives'
import { COLORS } from './options'

export const FillMenu = ({
  value,
  onChange
}: {
  value?: string
  onChange: (value: string) => void
}) => (
  <MenuSection title="Fill">
    <div className="wb-node-toolbar-swatch-grid">
      {COLORS.map((color) => (
        <ColorSwatch
          key={color}
          color={color}
          active={value === color}
          onClick={() => {
            onChange(color)
          }}
        />
      ))}
    </div>
  </MenuSection>
)
