import {
  Eraser,
  Highlighter,
  PencilLine
} from 'lucide-react'
import {
  ColorSwatchGrid,
  PickerDivider,
  PickerIconButton,
  PickerPanelSurface,
  PickerSection,
  PickerSurface,
  Slider
} from '@shared/ui'
import type {
  BrushStyle,
  BrushStylePatch,
  DrawBrush,
  DrawMode,
  DrawSlot
} from '@whiteboard/editor/draw'
import {
  DRAW_MODES,
  DRAW_SLOTS
} from '@whiteboard/editor/draw'
import { hasDrawBrush } from '@whiteboard/editor/draw'
import { DRAW_COLOR_OPTIONS } from '@whiteboard/react/features/selection/chrome/menus/options'

const DRAW_MODE_ICONS = {
  pen: PencilLine,
  highlighter: Highlighter,
  eraser: Eraser
} as const satisfies Record<DrawMode, typeof PencilLine>

const DRAW_WIDTH_RANGE = {
  pen: {
    min: 1,
    max: 16
  },
  highlighter: {
    min: 6,
    max: 24
  }
} as const satisfies Record<DrawBrush, { min: number, max: number }>

const resolveSlotSize = (
  width: number
) => Math.max(6, Math.min(16, width + 2))

export const DrawMenu = ({
  mode,
  activeSlot,
  slots,
  panelOpen = false,
  onMode,
  onSlot,
  onPatch
}: {
  mode: DrawMode
  activeSlot?: DrawSlot
  slots?: Readonly<Record<DrawSlot, BrushStyle>>
  panelOpen?: boolean
  onMode: (value: DrawMode) => void
  onSlot: (value: DrawSlot) => void
  onPatch: (patch: BrushStylePatch) => void
}) => {
  const brush = hasDrawBrush(mode)
    ? mode
    : undefined
  const style =
    brush && activeSlot && slots
      ? slots[activeSlot]
      : undefined

  return (
    <div
      className="flex items-start gap-3"
      data-brush={brush ? 'true' : undefined}
    >
      <PickerSurface className="w-14 items-center gap-1 p-[8px_7px]">
        <div
          className="flex w-full flex-col items-center gap-1"
          role="toolbar"
          aria-label="Draw mode"
        >
          {DRAW_MODES.map((value) => {
            const Icon = DRAW_MODE_ICONS[value]
            return (
              <PickerIconButton
                key={value}
                type="button"
                pressed={mode === value}
                onClick={() => onMode(value)}
                aria-label={value}
                title={value}
              >
                <Icon size={20} strokeWidth={1} absoluteStrokeWidth />
              </PickerIconButton>
            )
          })}
        </div>
        {brush && activeSlot && slots ? (
          <>
            <PickerDivider />
            <div
              className="flex w-full flex-col items-center gap-1"
              role="toolbar"
              aria-label="Draw slot"
            >
              {DRAW_SLOTS.map((slot) => {
                const slotStyle = slots[slot]
                return (
                  <PickerIconButton
                    key={slot}
                    type="button"
                    pressed={activeSlot === slot}
                    onClick={() => onSlot(slot)}
                    aria-label={`slot ${slot}`}
                    title={`slot ${slot}`}
                  >
                    <span
                      className="rounded-full shadow-[inset_0_0_0_1px_rgb(from_var(--ui-text-primary)_r_g_b_/_0.08)]"
                      style={{
                        width: resolveSlotSize(slotStyle.width),
                        height: resolveSlotSize(slotStyle.width),
                        background: slotStyle.color
                      }}
                    />
                  </PickerIconButton>
                )
              })}
            </div>
          </>
        ) : null}
      </PickerSurface>
      {panelOpen && brush && activeSlot && slots && style ? (
        <PickerPanelSurface className="w-[292px] p-3">
          <div className="min-w-0">
            <PickerSection title="Width">
              <div className="flex flex-col gap-2.5">
                <Slider
                  min={DRAW_WIDTH_RANGE[brush].min}
                  max={DRAW_WIDTH_RANGE[brush].max}
                  step={1}
                  value={style.width}
                  onValueChange={(value) => {
                    onPatch({
                      width: value
                    })
                  }}
                  onValueCommit={(value) => {
                    onPatch({
                      width: value
                    })
                  }}
                />
                <div className="flex items-center justify-between gap-2 text-[13px] text-fg-muted">
                  <span
                    className="shrink-0 rounded-full"
                    style={{
                      width: Math.max(10, Math.min(28, style.width * 2)),
                      height: Math.max(2, style.width),
                      background: style.color,
                      opacity: brush === 'highlighter' ? 0.35 : 1
                    }}
                  />
                  <span>{style.width}px</span>
                </div>
              </div>
            </PickerSection>
            <div className="mt-4">
              <PickerSection title="All colors">
                <ColorSwatchGrid
                  options={DRAW_COLOR_OPTIONS}
                  value={style.color}
                  onChange={(value) => onPatch({ color: value })}
                  className="grid-cols-5 gap-2.5"
                  swatchSize="md"
                />
              </PickerSection>
            </div>
          </div>
        </PickerPanelSurface>
      ) : null}
    </div>
  )
}
