import {
  Eraser,
  Highlighter,
  PencilLine
} from 'lucide-react'
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
import {
  ColorSwatch,
  MenuSection
} from '../../selection/chrome/menus/MenuPrimitives'
import { COLORS } from '../../selection/chrome/menus/options'

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
      className="wb-left-toolbar-draw-menu"
      data-brush={brushKind ? 'true' : undefined}
    >
      <div className="wb-left-toolbar-draw-dock">
        <div
          className="wb-left-toolbar-draw-rail"
          role="toolbar"
          aria-label="Draw kind"
        >
          {(Object.keys(DRAW_KIND_ICONS) as DrawKind[]).map((value) => {
            const Icon = DRAW_KIND_ICONS[value]
            return (
              <button
                key={value}
                type="button"
                className="wb-left-toolbar-draw-kind"
                data-active={kind === value ? 'true' : undefined}
                onClick={() => onKind(value)}
                data-selection-ignore
                data-input-ignore
                aria-label={value}
                title={value}
              >
                <Icon size={20} strokeWidth={1} absoluteStrokeWidth />
              </button>
            )
          })}
        </div>
        {brushKind && activeSlot && slots ? (
          <>
            <div className="wb-left-toolbar-draw-dock-divider" />
            <div
              className="wb-left-toolbar-draw-slot-list"
              role="toolbar"
              aria-label="Draw slot"
            >
              {DRAW_SLOTS.map((slot) => {
                const slotStyle = slots[slot]
                return (
                  <button
                    key={slot}
                    type="button"
                    className="wb-left-toolbar-draw-slot"
                    data-active={activeSlot === slot ? 'true' : undefined}
                    onClick={() => onSlot(slot)}
                    data-selection-ignore
                    data-input-ignore
                    aria-label={`slot ${slot}`}
                    title={`slot ${slot}`}
                  >
                    <span
                      className="wb-left-toolbar-draw-slot-dot"
                      style={{
                        width: resolveSlotSize(slotStyle.width),
                        height: resolveSlotSize(slotStyle.width),
                        background: slotStyle.color
                      }}
                    />
                  </button>
                )
              })}
            </div>
          </>
        ) : null}
      </div>
      {panelOpen && brushKind && activeSlot && slots && style ? (
        <div className="wb-left-toolbar-draw-panel">
          <div className="wb-left-toolbar-draw-panel-body">
            <MenuSection title="Width">
              <div className="wb-left-toolbar-draw-slider-wrap">
                <input
                  type="range"
                  className="wb-left-toolbar-draw-slider"
                  min={DRAW_WIDTH_RANGE[brushKind].min}
                  max={DRAW_WIDTH_RANGE[brushKind].max}
                  step={1}
                  value={style.width}
                  onChange={(event) => {
                    onPatch({
                      width: Number(event.currentTarget.value)
                    })
                  }}
                  data-selection-ignore
                  data-input-ignore
                />
                <div className="wb-left-toolbar-draw-slider-value">
                  <span
                    className="wb-left-toolbar-draw-slider-sample"
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
            </MenuSection>
            <MenuSection title="All colors">
              <div className="wb-node-toolbar-swatch-grid">
                {COLORS.map((color) => (
                  <ColorSwatch
                    key={color}
                    color={color}
                    active={style.color === color}
                    onClick={() => onPatch({ color })}
                  />
                ))}
              </div>
            </MenuSection>
          </div>
        </div>
      ) : null}
    </div>
  )
}
