import {
  ColorSwatchGrid,
  Panel,
  PanelSection,
  SegmentedButton,
  SliderSection,
  formatPercent
} from '@shared/ui'
import { sameOptionalNumberArray as isSameOptionalNumberArray } from '@shared/core'
import { STROKE_COLOR_OPTIONS } from '../menus/options'

const STROKE_STYLE_OPTIONS = [
  { key: 'solid', label: 'Solid', dash: undefined as readonly number[] | undefined },
  { key: 'dashed', label: 'Dashed', dash: [8, 6] as const },
  { key: 'dotted', label: 'Dotted', dash: [2, 4] as const }
] as const

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
        options={STROKE_COLOR_OPTIONS}
        value={stroke}
        onChange={onStrokeChange}
      />
    </PanelSection>
  </Panel>
)
