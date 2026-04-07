import {
  Eraser,
  Highlighter,
  PencilLine
} from 'lucide-react'
import { cn } from '@ui'
import type {
  BrushStyle,
  BrushStylePatch,
  DrawSlot
} from '@whiteboard/editor/draw'
import {
  DRAW_SLOTS
} from '@whiteboard/editor/draw'
import type {
  DrawBrushKind,
  DrawKind
} from '@whiteboard/editor'
import { isDrawBrushKind } from '@whiteboard/editor'
import { DRAW_COLOR_OPTIONS } from '../../selection/chrome/menus/options'
import {
  TOOLBOX_PANEL_CLASSNAME,
  ToolboxButton,
  ToolboxColorSwatch,
  ToolboxMenuSection
} from '../primitives'

const DRAW_KIND_ICONS = {
  pen: PencilLine,
  highlighter: Highlighter,
  eraser: Eraser
} as const satisfies Record<DrawKind, typeof PencilLine>

const DRAW_WIDTH_RANGE = {
  pen: {
    min: 1,
    max: 16
  },
  highlighter: {
    min: 6,
    max: 24
  }
} as const satisfies Record<DrawBrushKind, { min: number, max: number }>

const resolveSlotSize = (
  width: number
) => Math.max(6, Math.min(16, width + 2))

export const DrawMenu = ({
  kind,
  activeSlot,
  slots,
  panelOpen = false,
  onKind,
  onSlot,
  onPatch
}: {
  kind: DrawKind
  activeSlot?: DrawSlot
  slots?: Readonly<Record<DrawSlot, BrushStyle>>
  panelOpen?: boolean
  onKind: (value: DrawKind) => void
  onSlot: (value: DrawSlot) => void
  onPatch: (patch: BrushStylePatch) => void
}) => {
  const brushKind = isDrawBrushKind(kind)
    ? kind
    : undefined
  const style =
    brushKind && activeSlot && slots
      ? slots[activeSlot]
      : undefined

  return (
    <div
      className="flex items-start gap-3"
      data-brush={brushKind ? 'true' : undefined}
    >
      <div className={cn(
        TOOLBOX_PANEL_CLASSNAME,
        'flex w-14 flex-col items-center gap-1 p-[8px_7px]'
      )}>
        <div
          className="flex w-full flex-col items-center gap-1"
          role="toolbar"
          aria-label="Draw kind"
        >
          {(Object.keys(DRAW_KIND_ICONS) as DrawKind[]).map((value) => {
            const Icon = DRAW_KIND_ICONS[value]
            return (
              <ToolboxButton
                key={value}
                type="button"
                className="h-10 w-10 rounded-xl text-fg-muted hover:text-fg"
                pressed={kind === value}
                onClick={() => onKind(value)}
                aria-label={value}
                title={value}
              >
                <Icon size={20} strokeWidth={1} absoluteStrokeWidth />
              </ToolboxButton>
            )
          })}
        </div>
        {brushKind && activeSlot && slots ? (
          <>
            <div className="my-[4px] h-px w-full bg-[rgb(from_var(--ui-border-subtle)_r_g_b_/_0.45)]" />
            <div
              className="flex w-full flex-col items-center gap-1"
              role="toolbar"
              aria-label="Draw slot"
            >
              {DRAW_SLOTS.map((slot) => {
                const slotStyle = slots[slot]
                return (
                  <ToolboxButton
                    key={slot}
                    type="button"
                    className={cn(
                      'h-10 w-10 rounded-xl text-fg-muted hover:text-fg',
                      activeSlot === slot && 'bg-transparent [box-shadow:inset_0_0_0_2px_rgb(from_var(--ui-accent)_r_g_b_/_0.22)] hover:bg-transparent'
                    )}
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
                  </ToolboxButton>
                )
              })}
            </div>
          </>
        ) : null}
      </div>
      {panelOpen && brushKind && activeSlot && slots && style ? (
        <div className={cn(TOOLBOX_PANEL_CLASSNAME, 'w-[292px] p-3')}>
          <div className="min-w-0">
            <ToolboxMenuSection title="Width">
              <div className="flex flex-col gap-2.5">
                <input
                  type="range"
                  className="m-0 w-full [accent-color:var(--ui-accent)]"
                  min={DRAW_WIDTH_RANGE[brushKind].min}
                  max={DRAW_WIDTH_RANGE[brushKind].max}
                  step={1}
                  value={style.width}
                  onChange={(event) => {
                    onPatch({
                      width: Number(event.currentTarget.value)
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
                      opacity: brushKind === 'highlighter' ? 0.35 : 1
                    }}
                  />
                  <span>{style.width}px</span>
                </div>
              </div>
            </ToolboxMenuSection>
            <div className="mt-4">
              <ToolboxMenuSection title="All colors">
                <div className="grid grid-cols-5 gap-2.5">
                  {DRAW_COLOR_OPTIONS.map((option) => (
                    <ToolboxColorSwatch
                      key={option.value}
                      color={option.value}
                      active={style.color === option.value}
                      onClick={() => onPatch({ color: option.value })}
                    />
                  ))}
                </div>
              </ToolboxMenuSection>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
