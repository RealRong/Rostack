import {
  Chip,
  ChipRow,
  ColorSwatch,
  MenuSection
} from './MenuPrimitives'
import {
  COLORS,
  OPACITY_OPTIONS,
  STROKE_WIDTHS
} from './options'

export const StrokeMenu = ({
  colors = COLORS,
  widths = STROKE_WIDTHS,
  opacities = OPACITY_OPTIONS,
  stroke,
  strokeWidth,
  opacity,
  onStrokeChange,
  onStrokeWidthChange,
  onOpacityChange
}: {
  colors?: readonly string[]
  widths?: readonly number[]
  opacities?: readonly {
    label: string
    value: number
  }[]
  stroke?: string
  strokeWidth?: number
  opacity?: number
  onStrokeChange?: (value: string) => void
  onStrokeWidthChange?: (value: number) => void
  onOpacityChange?: (value: number) => void
}) => (
  <>
    {onStrokeChange ? (
      <MenuSection title="Stroke">
        <div className="wb-node-toolbar-swatch-grid">
          {colors.map((color) => (
            <ColorSwatch
              key={color}
              color={color}
              active={stroke === color}
              onClick={() => {
                onStrokeChange(color)
              }}
            />
          ))}
        </div>
      </MenuSection>
    ) : null}
    {onStrokeWidthChange ? (
      <MenuSection title="Width">
        <ChipRow>
          {widths.map((value) => (
            <Chip
              key={value}
              active={strokeWidth === value}
              onClick={() => {
                onStrokeWidthChange(value)
              }}
            >
              {value}
            </Chip>
          ))}
        </ChipRow>
      </MenuSection>
    ) : null}
    {onOpacityChange ? (
      <MenuSection title="Opacity">
        <ChipRow>
          {opacities.map((option) => (
            <Chip
              key={option.label}
              active={opacity === option.value}
              onClick={() => {
                onOpacityChange(option.value)
              }}
            >
              {option.label}
            </Chip>
          ))}
        </ChipRow>
      </MenuSection>
    ) : null}
  </>
)
