import { Slider } from '@ui'
import { isSameOptionalNumberArray } from '@whiteboard/core/equality'
import { STROKE_COLOR_OPTIONS } from '../menus/options'
import { Panel, PanelSection, SegmentedButton, SwatchButton } from './ShapeToolbarPrimitives'

const STROKE_STYLE_OPTIONS = [
  { key: 'solid', label: 'Solid', dash: undefined as readonly number[] | undefined },
  { key: 'dashed', label: 'Dashed', dash: [8, 6] as const },
  { key: 'dotted', label: 'Dotted', dash: [2, 4] as const }
] as const

const formatPercent = (
  value: number
) => `${Math.round(value * 100)}%`

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
  <Panel className="min-w-[280px]">
    {showStyle ? (
      <PanelSection title="Style">
        <div className="flex items-center gap-2">
          {STROKE_STYLE_OPTIONS.map((option) => (
            <SegmentedButton
              key={option.key}
              active={isSameOptionalNumberArray(
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
    <PanelSection title="Thickness">
      <Slider
        min={0}
        max={16}
        step={1}
        value={strokeWidth ?? 1}
        onValueChange={onStrokeWidthChange}
        onValueCommit={onStrokeWidthChange}
      />
    </PanelSection>
    {showOpacity && onOpacityChange ? (
      <PanelSection title="Opacity">
        <Slider
          min={0}
          max={1}
          step={0.05}
          value={opacity ?? 1}
          formatValue={formatPercent}
          onValueChange={onOpacityChange}
          onValueCommit={onOpacityChange}
        />
      </PanelSection>
    ) : null}
    <PanelSection title="Color">
      <div className="grid grid-cols-5 gap-2">
        {STROKE_COLOR_OPTIONS.map((option) => (
          <SwatchButton
            key={option.value}
            color={option.value}
            active={stroke === option.value}
            onClick={() => onStrokeChange(option.value)}
          />
        ))}
      </div>
    </PanelSection>
  </Panel>
)
