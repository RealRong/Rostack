import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SegmentedButton,
  SliderSection,
  formatPercent
} from '@shared/ui'
import { equal } from '@shared/core'
import {
  WHITEBOARD_PALETTE_GRID_COLUMNS,
  WHITEBOARD_PALETTE_SWATCH_SHAPE,
  WHITEBOARD_STROKE_COLOR_OPTIONS
} from '@whiteboard/react/features/palette'
import { product } from '@whiteboard/product'

const normalizeDash = (
  value: readonly number[] | undefined
) => value?.length ? value : undefined

export const BorderPanel = ({
  stroke,
  strokeWidth,
  opacity,
  strokeDash,
  showStyle = true,
  showOpacity = true,
  onStrokeChange,
  onStrokeWidthChange,
  onOpacityChange,
  onStrokeDashChange
}: {
  stroke?: string
  strokeWidth?: number
  opacity?: number
  strokeDash?: readonly number[]
  showStyle?: boolean
  showOpacity?: boolean
  onStrokeChange: (value: string) => void
  onStrokeWidthChange: (value: number) => void
  onOpacityChange?: (value: number) => void
  onStrokeDashChange?: (value?: readonly number[]) => void
}) => (
  <Panel>
    {showStyle ? (
      <PanelSection title="Style">
        <div className="flex items-center gap-2">
          {product.stroke.options.map((option) => (
            <SegmentedButton
              key={option.key}
              active={equal.sameOptionalNumberArray(
                normalizeDash(strokeDash),
                normalizeDash(option.dash)
              )}
              onClick={() => onStrokeDashChange?.(option.dash)}
            >
              <svg
                viewBox="0 0 40 12"
                className="block h-3.5 w-10 overflow-visible"
                fill="none"
              >
                <path
                  d="M3 6 H37"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray={option.dash?.join(' ')}
                  strokeLinecap="round"
                />
              </svg>
            </SegmentedButton>
          ))}
        </div>
      </PanelSection>
    ) : null}
    <SliderSection
      title="Thickness"
      min={0}
      max={16}
      step={1}
      value={strokeWidth ?? 1}
      onChange={onStrokeWidthChange}
    />
    {showOpacity && onOpacityChange ? (
      <SliderSection
        title="Opacity"
        min={0}
        max={1}
        step={0.05}
        value={opacity ?? 1}
        formatValue={formatPercent}
        onChange={onOpacityChange}
      />
    ) : null}
    <PanelSection title="Color">
      <ColorSwatchGrid
        options={WHITEBOARD_STROKE_COLOR_OPTIONS}
        value={stroke}
        onChange={onStrokeChange}
        columns={WHITEBOARD_PALETTE_GRID_COLUMNS}
        swatchShape={WHITEBOARD_PALETTE_SWATCH_SHAPE}
      />
    </PanelSection>
  </Panel>
)
